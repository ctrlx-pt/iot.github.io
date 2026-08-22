import { Router } from "express";
import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../db/client";
import { companies, stores } from "../../db/schema";
import {
  accessibleCompanyIds,
  assertStoreAccess,
  authenticate,
  canAccessCompany,
} from "../../middleware/auth";
import { asyncHandler, fail, ok } from "../../middleware/errors";
import { identifierGenerator } from "../../services/identifier-generator";

const createStoreSchema = z.object({
  companyId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  timezone: z.string().optional(),
  isActive: z.boolean().optional(),
});

const updateStoreSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  timezone: z.string().optional(),
  isActive: z.boolean().optional(),
});

export function createStoresRouter(): Router {
  const router = Router();
  router.use(authenticate);

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const db = getDb();
      const companyFilter =
        typeof req.query.companyId === "string" ? req.query.companyId : undefined;

      if (companyFilter && !canAccessCompany(req.user!, companyFilter)) {
        return fail(res, 403, "No access to this company", "FORBIDDEN");
      }

      const scope = accessibleCompanyIds(req.user!);
      let rows;
      if (companyFilter) {
        rows = await db.select().from(stores).where(eq(stores.companyId, companyFilter));
      } else if (scope === "all") {
        rows = await db.select().from(stores).orderBy(desc(stores.createdAt));
      } else if (scope.length === 0) {
        rows = [];
      } else {
        rows = await db
          .select()
          .from(stores)
          .where(inArray(stores.companyId, scope))
          .orderBy(desc(stores.createdAt));
      }

      // StoreManager / Operator / Viewer with assignments: filter
      const filtered = rows.filter((store) => {
        try {
          assertStoreAccess(req.user!, store);
          return true;
        } catch {
          return false;
        }
      });

      return ok(res, filtered);
    }),
  );

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      const db = getDb();
      const rows = await db.select().from(stores).where(eq(stores.id, req.params.id)).limit(1);
      const store = rows[0];
      if (!store) return fail(res, 404, "Store not found", "NOT_FOUND");
      try {
        assertStoreAccess(req.user!, store);
      } catch (e: any) {
        return fail(res, e.status || 403, e.message || "Forbidden", e.code || "FORBIDDEN");
      }

      const company = await db
        .select()
        .from(companies)
        .where(eq(companies.id, store.companyId))
        .limit(1);

      return ok(res, { ...store, company: company[0] ?? null });
    }),
  );

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const parsed = createStoreSchema.safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 422, "Validation failed", "VALIDATION_ERROR", parsed.error.issues);
      }

      if (!req.user!.isSuperAdmin) {
        return fail(res, 403, "Only SuperAdmin can create stores", "FORBIDDEN");
      }

      const { companyId } = parsed.data;
      const db = getDb();
      const companyRows = await db
        .select()
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);
      const company = companyRows[0];
      if (!company) return fail(res, 404, "Company not found", "NOT_FOUND");
      if (!company.isActive) return fail(res, 400, "Company is inactive", "BAD_REQUEST");

      const storeCode = await identifierGenerator.generateStoreCode(company.code);
      const inserted = await db
        .insert(stores)
        .values({
          storeCode,
          companyId,
          name: parsed.data.name,
          description: parsed.data.description,
          address: parsed.data.address,
          city: parsed.data.city,
          country: parsed.data.country,
          timezone: parsed.data.timezone ?? "Europe/Lisbon",
          isActive: parsed.data.isActive ?? true,
        })
        .returning();

      return ok(res, inserted[0], 201);
    }),
  );

  router.patch(
    "/:id",
    asyncHandler(async (req, res) => {
      const parsed = updateStoreSchema.safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 422, "Validation failed", "VALIDATION_ERROR", parsed.error.issues);
      }

      const db = getDb();
      const rows = await db.select().from(stores).where(eq(stores.id, req.params.id)).limit(1);
      const store = rows[0];
      if (!store) return fail(res, 404, "Store not found", "NOT_FOUND");

      try {
        assertStoreAccess(req.user!, store);
      } catch (e: any) {
        return fail(res, e.status || 403, e.message, e.code || "FORBIDDEN");
      }

      if (!req.user!.isSuperAdmin) {
        return fail(res, 403, "Only SuperAdmin can update stores", "FORBIDDEN");
      }

      // storeCode is immutable — never updated
      const updated = await db
        .update(stores)
        .set({
          ...parsed.data,
          updatedAt: new Date(),
        })
        .where(eq(stores.id, req.params.id))
        .returning();

      return ok(res, updated[0]);
    }),
  );

  router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
      const db = getDb();
      const rows = await db.select().from(stores).where(eq(stores.id, req.params.id)).limit(1);
      const store = rows[0];
      if (!store) return fail(res, 404, "Store not found", "NOT_FOUND");

      if (!req.user!.isSuperAdmin) {
        return fail(res, 403, "Only SuperAdmin can delete stores", "FORBIDDEN");
      }

      const deleted = await db
        .delete(stores)
        .where(eq(stores.id, req.params.id))
        .returning({ id: stores.id });
      return ok(res, { id: deleted[0].id });
    }),
  );

  return router;
}
