import { Router } from "express";
import { inArray } from "drizzle-orm";
import { getDb } from "../../db/client";
import {
  devices,
  furniture,
  gateways,
  homeAssistantInstances,
  kits,
  stores,
} from "../../db/schema";
import { accessibleCompanyIds, authenticate } from "../../middleware/auth";
import { asyncHandler, ok } from "../../middleware/errors";

const OFFLINE_MS = Number(process.env.DEVICE_OFFLINE_MS ?? 5 * 60 * 1000);

function deriveStatus(status: string, lastSeenAt: Date | null): string {
  if (lastSeenAt && Date.now() - new Date(lastSeenAt).getTime() > OFFLINE_MS) {
    return "OFFLINE";
  }
  return status || "UNKNOWN";
}

export function createMonitoringRouter(): Router {
  const router = Router();
  router.use(authenticate);

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const db = getDb();
      const scope = accessibleCompanyIds(req.user!);
      const storeRows =
        scope === "all"
          ? await db.select().from(stores)
          : scope.length === 0
            ? []
            : await db.select().from(stores).where(inArray(stores.companyId, scope));

      const storeIds = storeRows.map((s) => s.id);
      const gw =
        storeIds.length === 0
          ? []
          : await db.select().from(gateways).where(inArray(gateways.storeId, storeIds));
      const ha =
        storeIds.length === 0
          ? []
          : await db
              .select()
              .from(homeAssistantInstances)
              .where(inArray(homeAssistantInstances.storeId, storeIds));
      const furn =
        storeIds.length === 0
          ? []
          : await db.select().from(furniture).where(inArray(furniture.storeId, storeIds));
      const kitRows =
        furn.length === 0
          ? []
          : await db.select().from(kits).where(inArray(kits.furnitureId, furn.map((f) => f.id)));
      const deviceRows =
        kitRows.length === 0
          ? []
          : await db.select().from(devices).where(inArray(devices.kitId, kitRows.map((k) => k.id)));

      return ok(res, {
        gateways: gw.map((g) => ({
          ...g,
          status: deriveStatus(g.status, g.lastSeenAt),
        })),
        homeAssistant: ha.map(({ apiTokenEncrypted: _, ...rest }) => ({
          ...rest,
          status: deriveStatus(rest.status, rest.lastSeenAt),
        })),
        devices: deviceRows.map((d) => ({
          id: d.id,
          deviceCode: d.deviceCode,
          name: d.name,
          deviceType: d.deviceType,
          homeAssistantEntityId: d.homeAssistantEntityId,
          status: deriveStatus(d.status, d.lastSeenAt),
          lastSeenAt: d.lastSeenAt,
        })),
        counts: {
          gatewaysOnline: gw.filter((g) => deriveStatus(g.status, g.lastSeenAt) === "ONLINE").length,
          gatewaysOffline: gw.filter((g) => deriveStatus(g.status, g.lastSeenAt) !== "ONLINE").length,
          devicesOnline: deviceRows.filter((d) => deriveStatus(d.status, d.lastSeenAt) === "ONLINE")
            .length,
          devicesOffline: deviceRows.filter((d) => deriveStatus(d.status, d.lastSeenAt) !== "ONLINE")
            .length,
          haOnline: ha.filter((h) => deriveStatus(h.status, h.lastSeenAt) === "ONLINE").length,
          haOffline: ha.filter((h) => deriveStatus(h.status, h.lastSeenAt) !== "ONLINE").length,
        },
      });
    }),
  );

  return router;
}
