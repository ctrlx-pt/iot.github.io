import { Router } from "express";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { getDb } from "../../db/client";
import { devices, furniture, kits, stores } from "../../db/schema";
import { authenticate, assertStoreAccess } from "../../middleware/auth";
import { asyncHandler, fail, ok } from "../../middleware/errors";

export function createDeviceSearchRouter(): Router {
  const router = Router();
  router.use(authenticate);

  router.get(
    "/locations",
    asyncHandler(async (req, res) => {
      const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
      if (q.length < 2) return ok(res, { cities: [], countries: [] });

      const db = getDb();
      const pattern = `%${q}%`;
      const user = req.user!;

      const companyIds = user.isSuperAdmin ? null : user.memberships.map((m) => m.companyId);
      if (!user.isSuperAdmin && !companyIds?.length) {
        return ok(res, { cities: [], countries: [] });
      }

      const companyClause =
        companyIds && companyIds.length
          ? sql`s.company_id IN (${sql.join(companyIds.map((id) => sql`${id}`), sql`, `)})`
          : sql`true`;

      const cityRows = await db.execute<{ value: string }>(sql`
        SELECT DISTINCT city AS value FROM (
          SELECT d.city FROM devices d
          INNER JOIN kits k ON k.id = d.kit_id
          INNER JOIN furniture f ON f.id = k.furniture_id
          INNER JOIN stores s ON s.id = f.store_id
          WHERE d.city IS NOT NULL AND d.city <> '' AND d.city ILIKE ${pattern} AND ${companyClause}
          UNION
          SELECT s.city FROM stores s
          WHERE s.city IS NOT NULL AND s.city <> '' AND s.city ILIKE ${pattern} AND ${companyClause}
        ) t
        ORDER BY value LIMIT 12
      `);

      const countryRows = await db.execute<{ value: string }>(sql`
        SELECT DISTINCT country AS value FROM (
          SELECT d.country FROM devices d
          INNER JOIN kits k ON k.id = d.kit_id
          INNER JOIN furniture f ON f.id = k.furniture_id
          INNER JOIN stores s ON s.id = f.store_id
          WHERE d.country IS NOT NULL AND d.country <> '' AND d.country ILIKE ${pattern} AND ${companyClause}
          UNION
          SELECT s.country FROM stores s
          WHERE s.country IS NOT NULL AND s.country <> '' AND s.country ILIKE ${pattern} AND ${companyClause}
        ) t
        ORDER BY value LIMIT 12
      `);

      return ok(res, {
        cities: cityRows.rows.map((r) => r.value),
        countries: countryRows.rows.map((r) => r.value),
      });
    }),
  );

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
      const city = typeof req.query.city === "string" ? req.query.city.trim() : "";
      const country = typeof req.query.country === "string" ? req.query.country.trim() : "";
      if (!q && !city && !country) {
        return fail(res, 400, "q, city or country required", "BAD_REQUEST");
      }

      const db = getDb();
      const user = req.user!;
      const conditions = [];

      if (q) {
        conditions.push(
          or(
            ilike(devices.name, `%${q}%`),
            ilike(devices.deviceCode, `%${q}%`),
            ilike(devices.description, `%${q}%`),
            ilike(devices.address, `%${q}%`),
            ilike(devices.city, `%${q}%`),
            ilike(devices.country, `%${q}%`),
          ),
        );
      }
      if (city) conditions.push(ilike(devices.city, `%${city}%`));
      if (country) conditions.push(ilike(devices.country, `%${country}%`));

      const rows = await db
        .select({
          id: devices.id,
          deviceCode: devices.deviceCode,
          name: devices.name,
          description: devices.description,
          city: devices.city,
          country: devices.country,
          address: devices.address,
          status: devices.status,
          deviceType: devices.deviceType,
          imageUrl: devices.imageUrl,
          lastSeenAt: devices.lastSeenAt,
          kitId: devices.kitId,
          storeId: stores.id,
          storeName: stores.name,
          companyId: stores.companyId,
        })
        .from(devices)
        .innerJoin(kits, eq(kits.id, devices.kitId))
        .innerJoin(furniture, eq(furniture.id, kits.furnitureId))
        .innerJoin(stores, eq(stores.id, furniture.storeId))
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(devices.updatedAt))
        .limit(50);

      const scoped = [];
      for (const row of rows) {
        if (user.isSuperAdmin) {
          scoped.push(row);
          continue;
        }
        try {
          assertStoreAccess(user, { id: row.storeId, companyId: row.companyId });
          scoped.push(row);
        } catch {
          /* skip */
        }
      }

      return ok(res, scoped);
    }),
  );

  return router;
}
