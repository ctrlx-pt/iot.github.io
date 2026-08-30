import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../db/client";
import {
  devices,
  furniture,
  homeAssistantEntities,
  homeAssistantInstances,
  kits,
} from "../../db/schema";
import type { AuthUser } from "../../middleware/auth";
import { getDeviceScoped, getStoreForUser } from "../tenant-scope";
import {
  listAutomationsForInstance,
  type AutomationView,
} from "../home-assistant/automations";

function sanitizeHaInstance(row: typeof homeAssistantInstances.$inferSelect) {
  const { apiTokenEncrypted: _, ...rest } = row;
  return rest;
}

export async function getDeviceIntegrations(deviceId: string, user: AuthUser) {
  const { device, furniture: furn } = await getDeviceScoped(user, deviceId);
  const store = await getStoreForUser(user, furn.storeId);
  const db = getDb();

  const entityRows = await db
    .select()
    .from(homeAssistantEntities)
    .where(eq(homeAssistantEntities.deviceId, deviceId));

  let instance: ReturnType<typeof sanitizeHaInstance> | null = null;
  let haAutomations: AutomationView[] = [];

  const instanceId =
    entityRows[0]?.homeAssistantInstanceId ??
    (device.homeAssistantEntityId
      ? (
          await db
            .select()
            .from(homeAssistantInstances)
            .where(eq(homeAssistantInstances.storeId, store.id))
            .limit(1)
        )[0]?.id
      : null);

  if (instanceId) {
    const instRows = await db
      .select()
      .from(homeAssistantInstances)
      .where(eq(homeAssistantInstances.id, instanceId))
      .limit(1);
    instance = instRows[0] ? sanitizeHaInstance(instRows[0]) : null;
    if (instance) {
      try {
        const all = await listAutomationsForInstance(instanceId);
        const deviceEntityId = device.homeAssistantEntityId ?? entityRows[0]?.entityId ?? null;
        haAutomations = deviceEntityId
          ? all.filter((a) => a.deviceEntityId === deviceEntityId)
          : all;
      } catch {
        haAutomations = [];
      }
    }
  }

  return {
    store: { id: store.id, name: store.name, companyId: store.companyId },
    homeAssistant: {
      connected: !!(instance && (entityRows.length || device.homeAssistantEntityId)),
      instance,
      entities: entityRows,
      entityId: device.homeAssistantEntityId ?? entityRows[0]?.entityId ?? null,
      automations: haAutomations,
    },
  };
}

export async function listDevicesForStore(storeId: string, user: AuthUser) {
  await getStoreForUser(user, storeId);
  const db = getDb();

  const furnRows = await db
    .select({ id: furniture.id })
    .from(furniture)
    .where(eq(furniture.storeId, storeId));
  if (!furnRows.length) return [];

  const kitRows = await db
    .select({ id: kits.id })
    .from(kits)
    .where(inArray(kits.furnitureId, furnRows.map((f) => f.id)));
  if (!kitRows.length) return [];

  return db
    .select({
      id: devices.id,
      name: devices.name,
      deviceCode: devices.deviceCode,
      deviceType: devices.deviceType,
      status: devices.status,
      homeAssistantEntityId: devices.homeAssistantEntityId,
      kitId: devices.kitId,
    })
    .from(devices)
    .where(
      and(
        inArray(devices.kitId, kitRows.map((k) => k.id)),
        eq(devices.isActive, true),
      ),
    )
    .orderBy(desc(devices.name));
}
