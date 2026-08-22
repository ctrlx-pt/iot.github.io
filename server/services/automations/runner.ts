import { eq, inArray } from "drizzle-orm";
import { getDb } from "../../db/client";
import { automations, devices, furniture, kits, stores } from "../../db/schema";
import { getDeviceControlService } from "../device-control";

type AutomationRow = typeof automations.$inferSelect;

type AutoConfig = {
  time?: string; // "08:00"
  timezone?: string;
  actions?: Array<{
    type: "device_on" | "device_off" | "device_toggle";
    deviceId?: string;
  }>;
};

async function resolveDeviceIds(auto: AutomationRow): Promise<string[]> {
  const db = getDb();
  const cfg = JSON.parse(auto.configuration || "{}") as AutoConfig;
  const fromActions = (cfg.actions || []).map((a) => a.deviceId).filter(Boolean) as string[];
  if (fromActions.length) return fromActions;

  switch (auto.scopeType) {
    case "Device":
      return [auto.scopeId];
    case "Kit": {
      const rows = await db.select({ id: devices.id }).from(devices).where(eq(devices.kitId, auto.scopeId));
      return rows.map((r) => r.id);
    }
    case "Furniture": {
      const kitRows = await db.select({ id: kits.id }).from(kits).where(eq(kits.furnitureId, auto.scopeId));
      if (!kitRows.length) return [];
      const rows = await db
        .select({ id: devices.id })
        .from(devices)
        .where(inArray(devices.kitId, kitRows.map((k) => k.id)));
      return rows.map((r) => r.id);
    }
    case "Store": {
      const furn = await db.select({ id: furniture.id }).from(furniture).where(eq(furniture.storeId, auto.scopeId));
      if (!furn.length) return [];
      const kitRows = await db
        .select({ id: kits.id })
        .from(kits)
        .where(inArray(kits.furnitureId, furn.map((f) => f.id)));
      if (!kitRows.length) return [];
      const rows = await db
        .select({ id: devices.id })
        .from(devices)
        .where(inArray(devices.kitId, kitRows.map((k) => k.id)));
      return rows.map((r) => r.id);
    }
    default:
      return [];
  }
}

export async function runAutomationNow(auto: AutomationRow) {
  const cfg = JSON.parse(auto.configuration || "{}") as AutoConfig;
  const deviceIds = await resolveDeviceIds(auto);
  const control = getDeviceControlService();
  const results: unknown[] = [];

  const actions = cfg.actions?.length
    ? cfg.actions
    : deviceIds.map((deviceId) => ({ type: "device_on" as const, deviceId }));

  for (const action of actions) {
    const deviceId = action.deviceId;
    if (!deviceId) continue;
    try {
      if (action.type === "device_on") {
        results.push(await control.control(deviceId, { action: "on" }));
      } else if (action.type === "device_off") {
        results.push(await control.control(deviceId, { action: "off" }));
      } else if (action.type === "device_toggle") {
        results.push(await control.control(deviceId, { action: "toggle" }));
      }
    } catch (err: any) {
      results.push({ deviceId, error: err?.message || "failed" });
    }
  }

  const db = getDb();
  await db
    .update(automations)
    .set({ lastRunAt: new Date(), updatedAt: new Date() })
    .where(eq(automations.id, auto.id));

  return { automationId: auto.id, results };
}

/** Simple minute ticker for time-based automations. */
export function startAutomationScheduler() {
  setInterval(async () => {
    try {
      const db = getDb();
      const rows = await db
        .select()
        .from(automations)
        .where(eq(automations.isEnabled, true));
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

      for (const auto of rows) {
        if (auto.triggerType !== "time") continue;
        const cfg = JSON.parse(auto.configuration || "{}") as AutoConfig;
        if (!cfg.time || cfg.time !== hhmm) continue;
        // avoid double-run in same minute
        if (auto.lastRunAt) {
          const last = new Date(auto.lastRunAt);
          if (
            last.getFullYear() === now.getFullYear() &&
            last.getMonth() === now.getMonth() &&
            last.getDate() === now.getDate() &&
            last.getHours() === now.getHours() &&
            last.getMinutes() === now.getMinutes()
          ) {
            continue;
          }
        }
        await runAutomationNow(auto);
      }
    } catch (err) {
      console.error("[automations] scheduler tick failed", err);
    }
  }, 30_000).unref?.();
}
