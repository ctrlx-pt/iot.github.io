import { eq } from "drizzle-orm";
import { getDb } from "../../db/client";
import {
  devices,
  homeAssistantEntities,
  homeAssistantInstances,
} from "../../db/schema";
import { decryptSecret } from "../crypto/secrets";
import { HomeAssistantRestService, type IHomeAssistantService } from "../home-assistant/ha-rest";
import { AppError } from "../../middleware/errors";

export type DeviceControlCommand =
  | { action: "on"; data?: Record<string, unknown> }
  | { action: "off" }
  | { action: "toggle" }
  | { action: "set_brightness"; brightness: number }
  | { action: "set_color"; color: string | number[] }
  | { action: "set_temperature"; temperature: number }
  | { action: "set_volume"; volume: number }
  | { action: "set_input"; input: string }
  | { action: "call_service"; domain: string; service: string; data?: Record<string, unknown> };

export interface IDeviceControlService {
  control(deviceId: string, command: DeviceControlCommand): Promise<{ ok: true; state?: unknown }>;
  getNormalizedState(deviceId: string): Promise<Record<string, unknown>>;
}

export class HomeAssistantDeviceControlService implements IDeviceControlService {
  private async resolveHa(deviceId: string): Promise<{
    device: typeof devices.$inferSelect;
    entityId: string;
    client: IHomeAssistantService;
  }> {
    const db = getDb();
    const deviceRows = await db.select().from(devices).where(eq(devices.id, deviceId)).limit(1);
    const device = deviceRows[0];
    if (!device) throw new AppError(404, "Device not found", "NOT_FOUND");

    const mapping = await db
      .select()
      .from(homeAssistantEntities)
      .where(eq(homeAssistantEntities.deviceId, deviceId))
      .limit(1);

    const entityId = mapping[0]?.entityId || device.homeAssistantEntityId;
    if (!entityId) {
      throw new AppError(422, "Device is not mapped to a Home Assistant entity", "NOT_MAPPED");
    }

    let instanceId = mapping[0]?.homeAssistantInstanceId;
    if (!instanceId) {
      throw new AppError(422, "No Home Assistant instance for device mapping", "NOT_MAPPED");
    }

    const inst = await db
      .select()
      .from(homeAssistantInstances)
      .where(eq(homeAssistantInstances.id, instanceId))
      .limit(1);
    const instance = inst[0];
    if (!instance || !instance.isActive) {
      throw new AppError(503, "Home Assistant instance unavailable", "HA_UNAVAILABLE");
    }

    const token = decryptSecret(instance.apiTokenEncrypted);
    const client = new HomeAssistantRestService(instance.url, token);
    return { device, entityId, client };
  }

  async control(deviceId: string, command: DeviceControlCommand) {
    const { entityId, client } = await this.resolveHa(deviceId);

    switch (command.action) {
      case "on":
        await client.turnOn(entityId, command.data);
        break;
      case "off":
        await client.turnOff(entityId);
        break;
      case "toggle":
        await client.toggle(entityId);
        break;
      case "set_brightness":
        await client.setBrightness(entityId, command.brightness);
        break;
      case "set_color":
        await client.setColor(entityId, command.color);
        break;
      case "set_temperature":
        await client.turnOn(entityId, { color_temp_kelvin: command.temperature });
        break;
      case "set_volume":
        await client.callService("media_player", "volume_set", entityId, {
          volume_level: Math.max(0, Math.min(1, command.volume / 100)),
        });
        break;
      case "set_input":
        await client.callService("media_player", "select_source", entityId, {
          source: command.input,
        });
        break;
      case "call_service":
        await client.callService(command.domain, command.service, entityId, command.data);
        break;
      default:
        throw new AppError(400, "Unknown control action", "BAD_REQUEST");
    }

    const state = await client.getState(entityId);
    if (state) {
      const db = getDb();
      await db
        .update(devices)
        .set({
          status: state.state === "unavailable" ? "OFFLINE" : "ONLINE",
          lastSeenAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(devices.id, deviceId));
    }

    return { ok: true as const, state };
  }

  async getNormalizedState(deviceId: string) {
    try {
      const { entityId, client, device } = await this.resolveHa(deviceId);
      const state = await client.getState(entityId);
      const caps = safeJsonArray(device.capabilities);
      return {
        deviceId,
        deviceCode: device.deviceCode,
        status: state?.state === "unavailable" ? "OFFLINE" : "ONLINE",
        haState: state?.state ?? null,
        attributes: state?.attributes ?? {},
        capabilities: caps,
        configuration: safeJsonObject(device.configuration),
      };
    } catch (err: any) {
      if (err?.code === "NOT_MAPPED") {
        const db = getDb();
        const rows = await db.select().from(devices).where(eq(devices.id, deviceId)).limit(1);
        const device = rows[0];
        return {
          deviceId,
          deviceCode: device?.deviceCode,
          status: device?.status ?? "UNKNOWN",
          haState: null,
          attributes: {},
          capabilities: safeJsonArray(device?.capabilities),
          configuration: safeJsonObject(device?.configuration),
          mapped: false,
        };
      }
      throw err;
    }
  }
}

function safeJsonArray(raw?: string | null): string[] {
  try {
    const v = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function safeJsonObject(raw?: string | null): Record<string, unknown> {
  try {
    const v = JSON.parse(raw || "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

/** Abstraction entry — swap implementation without rewriting callers. */
let _deviceControl: IDeviceControlService = new HomeAssistantDeviceControlService();

export function getDeviceControlService(): IDeviceControlService {
  return _deviceControl;
}

export function setDeviceControlService(svc: IDeviceControlService) {
  _deviceControl = svc;
}
