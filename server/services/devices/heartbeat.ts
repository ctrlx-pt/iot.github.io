import { eq } from "drizzle-orm";
import { getDb } from "../../db/client";
import {
  devices,
  homeAssistantEntities,
  homeAssistantInstances,
} from "../../db/schema";
import { decryptSecret } from "../crypto/secrets";
import { HomeAssistantRestService } from "../home-assistant/ha-rest";

export type HeartbeatResult = {
  deviceId: string;
  status: string;
  lastSeenAt: string | null;
  source: "integration" | "mock" | "manual";
  latencyMs?: number;
};

/** Refresh heartbeat from integration mapping or mock fallback. */
export async function refreshDeviceHeartbeat(deviceId: string): Promise<HeartbeatResult> {
  const db = getDb();
  const rows = await db.select().from(devices).where(eq(devices.id, deviceId)).limit(1);
  const device = rows[0];
  if (!device) throw new Error("Device not found");

  const mapping = await db
    .select()
    .from(homeAssistantEntities)
    .where(eq(homeAssistantEntities.deviceId, deviceId))
    .limit(1);

  const entityId = mapping[0]?.entityId || device.homeAssistantEntityId;
  const instanceId = mapping[0]?.homeAssistantInstanceId;

  if (entityId && instanceId) {
    const instRows = await db
      .select()
      .from(homeAssistantInstances)
      .where(eq(homeAssistantInstances.id, instanceId))
      .limit(1);
    const inst = instRows[0];
    if (inst?.isActive) {
      const started = Date.now();
      try {
        const token = decryptSecret(inst.apiTokenEncrypted);
        const client = new HomeAssistantRestService(inst.url, token);
        const state = await client.getState(entityId);
        const status =
          !state || state.state === "unavailable" || state.state === "unknown"
            ? "OFFLINE"
            : "ONLINE";
        const now = new Date();
        await db
          .update(devices)
          .set({
            status,
            lastSeenAt: now,
            heartbeatSource: "integration",
            updatedAt: now,
          })
          .where(eq(devices.id, deviceId));

        if (mapping[0]) {
          await db
            .update(homeAssistantEntities)
            .set({
              isAvailable: status === "ONLINE",
              lastState: state?.state ?? null,
              lastUpdatedAt: now,
            })
            .where(eq(homeAssistantEntities.id, mapping[0].id));
        }

        return {
          deviceId,
          status,
          lastSeenAt: now.toISOString(),
          source: "integration",
          latencyMs: Date.now() - started,
        };
      } catch {
        // fall through to mock
      }
    }
  }

  // Mock heartbeat — keeps seeded / offline devices alive when polled
  const now = new Date();
  const staleMs = Number(process.env.DEVICE_OFFLINE_MS ?? 5 * 60 * 1000);
  const lastSeen = device.lastSeenAt ? new Date(device.lastSeenAt).getTime() : 0;
  const isRecent = lastSeen > 0 && now.getTime() - lastSeen < staleMs;
  const status = isRecent ? device.status || "ONLINE" : "OFFLINE";

  await db
    .update(devices)
    .set({
      status,
      lastSeenAt: isRecent ? device.lastSeenAt : now,
      heartbeatSource: "mock",
      updatedAt: now,
    })
    .where(eq(devices.id, deviceId));

  return {
    deviceId,
    status,
    lastSeenAt: (isRecent ? device.lastSeenAt : now)?.toISOString?.() ?? now.toISOString(),
    source: "mock",
  };
}

export async function recordManualHeartbeat(deviceId: string, status = "ONLINE"): Promise<HeartbeatResult> {
  const db = getDb();
  const now = new Date();
  await db
    .update(devices)
    .set({
      status,
      lastSeenAt: now,
      heartbeatSource: "manual",
      updatedAt: now,
    })
    .where(eq(devices.id, deviceId));

  return {
    deviceId,
    status,
    lastSeenAt: now.toISOString(),
    source: "manual",
  };
}
