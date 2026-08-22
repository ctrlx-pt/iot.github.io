import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  devices,
  furniture,
  kits,
  stores,
} from "../db/schema";
import {
  assertStoreAccess,
  type AuthUser,
} from "../middleware/auth";
import { AppError } from "../middleware/errors";

export async function getStoreForUser(user: AuthUser, storeId: string) {
  const db = getDb();
  const rows = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  const store = rows[0];
  if (!store) throw new AppError(404, "Store not found", "NOT_FOUND");
  assertStoreAccess(user, store);
  return store;
}

export async function getFurnitureScoped(user: AuthUser, furnitureId: string) {
  const db = getDb();
  const rows = await db.select().from(furniture).where(eq(furniture.id, furnitureId)).limit(1);
  const item = rows[0];
  if (!item) throw new AppError(404, "Furniture not found", "NOT_FOUND");
  await getStoreForUser(user, item.storeId);
  return item;
}

export async function getKitScoped(user: AuthUser, kitId: string) {
  const db = getDb();
  const rows = await db.select().from(kits).where(eq(kits.id, kitId)).limit(1);
  const kit = rows[0];
  if (!kit) throw new AppError(404, "Kit not found", "NOT_FOUND");
  const furn = await getFurnitureScoped(user, kit.furnitureId);
  return { kit, furniture: furn };
}

export async function getDeviceScoped(user: AuthUser, deviceId: string) {
  const db = getDb();
  const rows = await db.select().from(devices).where(eq(devices.id, deviceId)).limit(1);
  const device = rows[0];
  if (!device) throw new AppError(404, "Device not found", "NOT_FOUND");
  const { kit, furniture: furn } = await getKitScoped(user, device.kitId);
  return { device, kit, furniture: furn };
}

export function defaultCapabilitiesForType(deviceType: string): string[] {
  switch (deviceType) {
    case "LED":
    case "LED_CONTROLLER":
      return ["Power", "Brightness", "Color", "Temperature"];
    case "TV":
    case "DISPLAY":
      return ["Power", "Volume", "Input"];
    case "RELAY":
    case "POWER_CONTROLLER":
      return ["Power"];
    default:
      return ["Power", "Status"];
  }
}
