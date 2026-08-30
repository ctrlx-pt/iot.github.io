import { and, eq, gte, lt } from "drizzle-orm";
import { getDb } from "../../db/client";
import {
  deviceHeartbeatBuckets,
  type HeartbeatLevel,
} from "../../db/schema";

const LEVEL_PRIORITY: Record<HeartbeatLevel, number> = {
  ok: 0,
  degraded: 1,
  offline: 2,
};

export function truncateToUtcHour(at: Date): Date {
  return new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate(), at.getUTCHours(), 0, 0, 0),
  );
}

export function worstHeartbeatLevel(a: HeartbeatLevel, b: HeartbeatLevel): HeartbeatLevel {
  return LEVEL_PRIORITY[a] >= LEVEL_PRIORITY[b] ? a : b;
}

export function inferHeartbeatLevel(
  status: string,
  source: "integration" | "mock" | "manual",
  latencyMs?: number,
): HeartbeatLevel {
  const normalized = status.toUpperCase();
  if (normalized === "OFFLINE") return "offline";
  if (normalized === "WARNING") return "degraded";
  if (source === "mock") return "degraded";
  if (source === "manual") return normalized === "ONLINE" ? "ok" : "degraded";
  if (latencyMs != null && latencyMs > 5000) return "degraded";
  if (normalized === "ONLINE") return "ok";
  return "degraded";
}

export async function recordHeartbeatBucket(
  deviceId: string,
  level: HeartbeatLevel,
  at = new Date(),
): Promise<void> {
  const hourStart = truncateToUtcHour(at);
  const db = getDb();
  const existing = await db
    .select()
    .from(deviceHeartbeatBuckets)
    .where(
      and(
        eq(deviceHeartbeatBuckets.deviceId, deviceId),
        eq(deviceHeartbeatBuckets.hourStart, hourStart),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(deviceHeartbeatBuckets)
      .set({
        level: worstHeartbeatLevel(existing[0].level as HeartbeatLevel, level),
        sampleCount: existing[0].sampleCount + 1,
        updatedAt: new Date(),
      })
      .where(eq(deviceHeartbeatBuckets.id, existing[0].id));
  } else {
    await db.insert(deviceHeartbeatBuckets).values({
      deviceId,
      hourStart,
      level,
      sampleCount: 1,
    });
  }

  const cutoff = new Date(at.getTime() - 90 * 24 * 60 * 60 * 1000);
  await db
    .delete(deviceHeartbeatBuckets)
    .where(
      and(
        eq(deviceHeartbeatBuckets.deviceId, deviceId),
        lt(deviceHeartbeatBuckets.hourStart, cutoff),
      ),
    );
}

export type HeartbeatHistoryBucket = {
  hourStart: string;
  level: HeartbeatLevel;
  sampleCount: number;
};

export async function getDeviceHeartbeatHistory(
  deviceId: string,
  days = 14,
): Promise<HeartbeatHistoryBucket[]> {
  const safeDays = Math.min(Math.max(days, 1), 90);
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - safeDays);
  since.setUTCHours(0, 0, 0, 0);

  const db = getDb();
  const rows = await db
    .select()
    .from(deviceHeartbeatBuckets)
    .where(
      and(
        eq(deviceHeartbeatBuckets.deviceId, deviceId),
        gte(deviceHeartbeatBuckets.hourStart, since),
      ),
    )
    .orderBy(deviceHeartbeatBuckets.hourStart);

  return rows.map((row) => ({
    hourStart: row.hourStart.toISOString(),
    level: row.level as HeartbeatLevel,
    sampleCount: row.sampleCount,
  }));
}
