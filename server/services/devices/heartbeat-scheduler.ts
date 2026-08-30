import { eq } from "drizzle-orm";
import { getDb } from "../../db/client";
import { devices } from "../../db/schema";
import { refreshDeviceHeartbeat } from "./heartbeat";

const DEFAULT_CONCURRENCY = 5;

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    await Promise.all(batch.map(fn));
  }
}

/** Poll all active devices and record hourly heartbeat buckets. */
export async function runDeviceHeartbeatSchedulerTick() {
  const db = getDb();
  const rows = await db
    .select({ id: devices.id })
    .from(devices)
    .where(eq(devices.isActive, true));

  const concurrency = Math.max(
    1,
    Number(process.env.HEARTBEAT_CRON_CONCURRENCY ?? DEFAULT_CONCURRENCY),
  );

  let ok = 0;
  let failed = 0;
  const errors: Array<{ deviceId: string; error: string }> = [];

  await mapWithConcurrency(rows, concurrency, async ({ id }) => {
    try {
      await refreshDeviceHeartbeat(id);
      ok += 1;
    } catch (err: any) {
      failed += 1;
      if (errors.length < 20) {
        errors.push({ deviceId: id, error: err?.message || "failed" });
      }
    }
  });

  return {
    total: rows.length,
    ok,
    failed,
    errors,
    at: new Date().toISOString(),
  };
}

/** Local/Docker ticker — disabled on Netlify (use scheduled function instead). */
export function startDeviceHeartbeatScheduler() {
  if (process.env.DISABLE_HEARTBEAT_SCHEDULER === "true") return;

  const intervalMs = Math.max(
    60_000,
    Number(process.env.HEARTBEAT_SCHEDULER_MS ?? 5 * 60 * 1000),
  );

  const tick = async () => {
    try {
      const result = await runDeviceHeartbeatSchedulerTick();
      console.log("[heartbeat-scheduler]", JSON.stringify(result));
    } catch (err) {
      console.error("[heartbeat-scheduler] tick failed", err);
    }
  };

  void tick();
  setInterval(tick, intervalMs).unref?.();
}
