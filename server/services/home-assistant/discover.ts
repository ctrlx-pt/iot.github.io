import { and, eq } from "drizzle-orm";
import { getDb } from "../../db/client";
import {
  devices,
  furniture,
  gateways,
  homeAssistantEntities,
  homeAssistantInstances,
  kits,
  stores,
} from "../../db/schema";
import { decryptSecret } from "../crypto/secrets";
import { identifierGenerator } from "../identifier-generator";
import { defaultCapabilitiesForType } from "../tenant-scope";
import { HomeAssistantRestService, type HaState } from "./ha-rest";

const DISCOVERABLE_DOMAINS = new Set([
  "light",
  "switch",
  "media_player",
  "cover",
  "fan",
  "climate",
  "lock",
  "input_boolean",
  "remote",
]);

function mapDomainToDeviceType(domain: string): string {
  switch (domain) {
    case "light":
      return "LED";
    case "media_player":
      return "TV";
    case "switch":
    case "input_boolean":
      return "RELAY";
    case "climate":
    case "fan":
    case "cover":
    case "lock":
    case "remote":
      return "OTHER";
    default:
      return "OTHER";
  }
}

function capabilitiesForDomain(domain: string): string[] {
  switch (domain) {
    case "light":
      return ["Power", "Brightness", "Color", "Temperature"];
    case "media_player":
      return ["Power", "Volume", "Input"];
    case "switch":
    case "input_boolean":
    case "remote":
      return ["Power"];
    default:
      return defaultCapabilitiesForType(mapDomainToDeviceType(domain));
  }
}

function isDiscoverable(state: HaState): boolean {
  const domain = state.entity_id.split(".")[0] || "";
  if (!DISCOVERABLE_DOMAINS.has(domain)) return false;
  // skip HA helpers / groups often ending with _2 unused — keep simple
  if (state.attributes?.entity_id && Array.isArray(state.attributes.entity_id)) {
    // light groups — still useful, keep them
  }
  return true;
}

async function ensureDiscoveryKit(storeId: string, storeCode: string) {
  const db = getDb();
  const existingFurn = await db
    .select()
    .from(furniture)
    .where(and(eq(furniture.storeId, storeId), eq(furniture.name, "Home Assistant")));

  let furn = existingFurn[0];
  if (!furn) {
    const furnitureCode = await identifierGenerator.generateFurnitureCode(storeCode);
    const [created] = await db
      .insert(furniture)
      .values({
        furnitureCode,
        storeId,
        name: "Home Assistant",
        description: "Dispositivos descobertos automaticamente via Home Assistant",
        status: "ONLINE",
      })
      .returning();
    furn = created;
  }

  const existingKits = await db
    .select()
    .from(kits)
    .where(and(eq(kits.furnitureId, furn.id), eq(kits.name, "Dispositivos descobertos")));

  let kit = existingKits[0];
  if (!kit) {
    const kitCode = await identifierGenerator.generateKitCode(storeCode);
    const [created] = await db
      .insert(kits)
      .values({
        kitCode,
        furnitureId: furn.id,
        name: "Dispositivos descobertos",
        description: "Sincronizado a partir da API do Home Assistant",
        kitType: "ha_discovered",
        status: "ONLINE",
      })
      .returning();
    kit = created;
  }

  return { furniture: furn, kit };
}

async function ensureStoreGateway(storeId: string, haInstanceId: string) {
  const db = getDb();
  const existing = await db
    .select()
    .from(gateways)
    .where(eq(gateways.homeAssistantInstanceId, haInstanceId))
    .limit(1);
  if (existing[0]) {
    await db
      .update(gateways)
      .set({ status: "ONLINE", lastSeenAt: new Date(), updatedAt: new Date() })
      .where(eq(gateways.id, existing[0].id));
    return existing[0];
  }

  const hardwareId = await identifierGenerator.generateGatewayHardwareId();
  const [gw] = await db
    .insert(gateways)
    .values({
      hardwareId,
      name: "HA Gateway",
      storeId,
      homeAssistantInstanceId: haInstanceId,
      status: "ONLINE",
      lastSeenAt: new Date(),
    })
    .returning();
  return gw;
}

export type DiscoverResult = {
  discovered: number;
  created: number;
  updated: number;
  skipped: number;
  furnitureId: string;
  kitId: string;
  devices: Array<{ id: string; deviceCode: string; name: string; entityId: string; status: string }>;
};

export async function discoverDevicesFromHomeAssistant(
  instanceId: string,
): Promise<DiscoverResult> {
  const db = getDb();
  const instRows = await db
    .select()
    .from(homeAssistantInstances)
    .where(eq(homeAssistantInstances.id, instanceId))
    .limit(1);
  const inst = instRows[0];
  if (!inst) throw new Error("Home Assistant instance not found");

  const storeRows = await db.select().from(stores).where(eq(stores.id, inst.storeId)).limit(1);
  const store = storeRows[0];
  if (!store) throw new Error("Store not found");

  const token = decryptSecret(inst.apiTokenEncrypted);
  const client = new HomeAssistantRestService(inst.url, token);
  const states = await client.getStates();

  await db
    .update(homeAssistantInstances)
    .set({ status: "ONLINE", lastSeenAt: new Date(), updatedAt: new Date() })
    .where(eq(homeAssistantInstances.id, inst.id));

  const { furniture: furn, kit } = await ensureDiscoveryKit(store.id, store.storeCode);
  const gateway = await ensureStoreGateway(store.id, inst.id);

  const candidates = states.filter(isDiscoverable);
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const synced: DiscoverResult["devices"] = [];

  for (const state of candidates) {
    const domain = state.entity_id.split(".")[0] || "other";
    const deviceType = mapDomainToDeviceType(domain);
    const friendlyName =
      (typeof state.attributes?.friendly_name === "string" && state.attributes.friendly_name) ||
      state.entity_id;
    const status = state.state === "unavailable" || state.state === "unknown" ? "OFFLINE" : "ONLINE";
    const configuration = {
      haState: state.state,
      attributes: {
        brightness: state.attributes?.brightness,
        color_temp: state.attributes?.color_temp,
        rgb_color: state.attributes?.rgb_color,
        volume_level: state.attributes?.volume_level,
        source: state.attributes?.source,
      },
    };

    const existingMap = await db
      .select()
      .from(homeAssistantEntities)
      .where(
        and(
          eq(homeAssistantEntities.homeAssistantInstanceId, inst.id),
          eq(homeAssistantEntities.entityId, state.entity_id),
        ),
      )
      .limit(1);

    if (existingMap[0]) {
      const [dev] = await db
        .update(devices)
        .set({
          name: friendlyName,
          status,
          lastSeenAt: new Date(),
          configuration: JSON.stringify(configuration),
          gatewayId: gateway.id,
          homeAssistantEntityId: state.entity_id,
          updatedAt: new Date(),
        })
        .where(eq(devices.id, existingMap[0].deviceId))
        .returning();

      await db
        .update(homeAssistantEntities)
        .set({
          friendlyName,
          entityType: domain,
          isAvailable: status === "ONLINE",
          lastState: state.state,
          lastUpdatedAt: new Date(),
        })
        .where(eq(homeAssistantEntities.id, existingMap[0].id));

      if (dev) {
        updated += 1;
        synced.push({
          id: dev.id,
          deviceCode: dev.deviceCode,
          name: dev.name,
          entityId: state.entity_id,
          status: dev.status,
        });
      } else {
        skipped += 1;
      }
      continue;
    }

    // Also match by homeAssistantEntityId on device table (legacy)
    const byEntity = await db
      .select()
      .from(devices)
      .where(eq(devices.homeAssistantEntityId, state.entity_id))
      .limit(1);

    if (byEntity[0]) {
      const [dev] = await db
        .update(devices)
        .set({
          name: friendlyName,
          status,
          lastSeenAt: new Date(),
          configuration: JSON.stringify(configuration),
          gatewayId: gateway.id,
          kitId: kit.id,
          updatedAt: new Date(),
        })
        .where(eq(devices.id, byEntity[0].id))
        .returning();

      await db.insert(homeAssistantEntities).values({
        homeAssistantInstanceId: inst.id,
        deviceId: byEntity[0].id,
        entityId: state.entity_id,
        entityType: domain,
        friendlyName,
        isAvailable: status === "ONLINE",
        lastState: state.state,
        lastUpdatedAt: new Date(),
      });

      updated += 1;
      if (dev) {
        synced.push({
          id: dev.id,
          deviceCode: dev.deviceCode,
          name: dev.name,
          entityId: state.entity_id,
          status: dev.status,
        });
      }
      continue;
    }

    const deviceCode = await identifierGenerator.generateDeviceCode(kit.kitCode, deviceType);
    const [dev] = await db
      .insert(devices)
      .values({
        deviceCode,
        kitId: kit.id,
        gatewayId: gateway.id,
        name: friendlyName,
        deviceType,
        status,
        homeAssistantEntityId: state.entity_id,
        configuration: JSON.stringify(configuration),
        capabilities: JSON.stringify(capabilitiesForDomain(domain)),
        lastSeenAt: new Date(),
      })
      .returning();

    await db.insert(homeAssistantEntities).values({
      homeAssistantInstanceId: inst.id,
      deviceId: dev.id,
      entityId: state.entity_id,
      entityType: domain,
      friendlyName,
      isAvailable: status === "ONLINE",
      lastState: state.state,
      lastUpdatedAt: new Date(),
    });

    created += 1;
    synced.push({
      id: dev.id,
      deviceCode: dev.deviceCode,
      name: dev.name,
      entityId: state.entity_id,
      status: dev.status,
    });
  }

  return {
    discovered: candidates.length,
    created,
    updated,
    skipped,
    furnitureId: furn.id,
    kitId: kit.id,
    devices: synced,
  };
}
