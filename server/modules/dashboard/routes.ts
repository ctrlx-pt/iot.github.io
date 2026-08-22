import { Router } from "express";
import { inArray } from "drizzle-orm";
import { getDb } from "../../db/client";
import {
  companies,
  devices,
  furniture,
  gateways,
  kits,
  stores,
} from "../../db/schema";
import { accessibleCompanyIds, authenticate } from "../../middleware/auth";
import { asyncHandler, ok } from "../../middleware/errors";

export function createDashboardRouter(): Router {
  const router = Router();
  router.use(authenticate);

  router.get(
    "/summary",
    asyncHandler(async (req, res) => {
      const db = getDb();
      const scope = accessibleCompanyIds(req.user!);

      const companyRows =
        scope === "all"
          ? await db.select().from(companies)
          : scope.length === 0
            ? []
            : await db.select().from(companies).where(inArray(companies.id, scope));

      const companyIds = companyRows.map((c) => c.id);
      const storeRows =
        companyIds.length === 0
          ? []
          : await db.select().from(stores).where(inArray(stores.companyId, companyIds));

      const filteredStores = storeRows.filter((s) => {
        if (req.user!.isSuperAdmin) return true;
        if (req.user!.storeIds.length === 0) return true;
        const membership = req.user!.memberships.find((m) => m.companyId === s.companyId);
        if (!membership) return false;
        if (membership.role === "CompanyAdmin") return true;
        return req.user!.storeIds.includes(s.id);
      });

      const storeIds = filteredStores.map((s) => s.id);
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
      const gw =
        storeIds.length === 0
          ? []
          : await db.select().from(gateways).where(inArray(gateways.storeId, storeIds));

      const onlineDevices = deviceRows.filter((d) => d.status === "ONLINE").length;
      const offlineDevices = deviceRows.length - onlineDevices;

      return ok(res, {
        totalCompanies: companyRows.length,
        totalStores: filteredStores.length,
        totalFurniture: furn.length,
        totalKits: kitRows.length,
        totalDevices: deviceRows.length,
        onlineDevices,
        offlineDevices,
        gatewaysOnline: gw.filter((g) => g.status === "ONLINE").length,
        gatewaysOffline: gw.filter((g) => g.status !== "ONLINE").length,
        stores: filteredStores.map((s) => {
          const company = companyRows.find((c) => c.id === s.companyId);
          const storeFurn = furn.filter((f) => f.storeId === s.id);
          const storeKits = kitRows.filter((k) => storeFurn.some((f) => f.id === k.furnitureId));
          const storeDevices = deviceRows.filter((d) => storeKits.some((k) => k.id === d.kitId));
          const offline = storeDevices.filter((d) => d.status !== "ONLINE").length;
          return {
            id: s.id,
            storeCode: s.storeCode,
            name: s.name,
            city: s.city,
            country: s.country,
            isActive: s.isActive,
            status: offline > 0 ? "WARNING" : s.isActive ? "ONLINE" : "OFFLINE",
            companyId: s.companyId,
            companyCode: company?.code,
            companyName: company?.name,
            deviceCount: storeDevices.length,
            offlineCount: offline,
          };
        }),
        companies: companyRows.map((c) => ({
          id: c.id,
          code: c.code,
          name: c.name,
          isActive: c.isActive,
          storeCount: filteredStores.filter((s) => s.companyId === c.id).length,
        })),
      });
    }),
  );

  return router;
}
