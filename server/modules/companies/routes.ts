import { Router } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../db/client";
import { companies, stores } from "../../db/schema";
import {
  accessibleCompanyIds,
  authenticate,
  canAccessCompany,
  requireSuperAdmin,
} from "../../middleware/auth";
import { asyncHandler, fail, ok } from "../../middleware/errors";

const createCompanySchema = z.object({
  code: z.string().regex(/^\d{2}$/, "Company code must be 2 digits"),
  name: z.string().min(1),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

const updateCompanySchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

export function createCompaniesRouter(): Router {
  const router = Router();

  router.use(authenticate);

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const db = getDb();
      const scope = accessibleCompanyIds(req.user!);
      const rows =
        scope === "all"
          ? await db.select().from(companies).orderBy(companies.code)
          : scope.length === 0
            ? []
            : await db
                .select()
                .from(companies)
                .where(inArray(companies.id, scope))
                .orderBy(companies.code);
      return ok(res, rows);
    }),
  );

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      if (!canAccessCompany(req.user!, req.params.id)) {
        return fail(res, 403, "No access to this company", "FORBIDDEN");
      }
      const db = getDb();
      const rows = await db.select().from(companies).where(eq(companies.id, req.params.id)).limit(1);
      if (!rows[0]) return fail(res, 404, "Company not found", "NOT_FOUND");
      return ok(res, rows[0]);
    }),
  );

  router.get(
    "/:id/stores",
    asyncHandler(async (req, res) => {
      if (!canAccessCompany(req.user!, req.params.id)) {
        return fail(res, 403, "No access to this company", "FORBIDDEN");
      }
      const db = getDb();
      const rows = await db
        .select()
        .from(stores)
        .where(eq(stores.companyId, req.params.id))
        .orderBy(desc(stores.createdAt));
      return ok(res, rows);
    }),
  );

  router.post(
    "/",
    requireSuperAdmin,
    asyncHandler(async (req, res) => {
      const parsed = createCompanySchema.safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 422, "Validation failed", "VALIDATION_ERROR", parsed.error.issues);
      }
      const db = getDb();
      const existing = await db
        .select()
        .from(companies)
        .where(eq(companies.code, parsed.data.code))
        .limit(1);
      if (existing.length) {
        return fail(res, 409, "Company code already exists", "CONFLICT");
      }
      const inserted = await db
        .insert(companies)
        .values({
          code: parsed.data.code,
          name: parsed.data.name,
          description: parsed.data.description,
          isActive: parsed.data.isActive ?? true,
        })
        .returning();
      return ok(res, inserted[0], 201);
    }),
  );

  router.patch(
    "/:id",
    requireSuperAdmin,
    asyncHandler(async (req, res) => {
      const parsed = updateCompanySchema.safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 422, "Validation failed", "VALIDATION_ERROR", parsed.error.issues);
      }
      // Code is immutable — never accepted on update
      const db = getDb();
      const updated = await db
        .update(companies)
        .set({
          ...parsed.data,
          description: parsed.data.description === null ? null : parsed.data.description,
          updatedAt: new Date(),
        })
        .where(eq(companies.id, req.params.id))
        .returning();
      if (!updated[0]) return fail(res, 404, "Company not found", "NOT_FOUND");
      return ok(res, updated[0]);
    }),
  );

  router.delete(
    "/:id",
    requireSuperAdmin,
    asyncHandler(async (req, res) => {
      const db = getDb();
      const deleted = await db
        .delete(companies)
        .where(eq(companies.id, req.params.id))
        .returning({ id: companies.id });
      if (!deleted[0]) return fail(res, 404, "Company not found", "NOT_FOUND");
      return ok(res, { id: deleted[0].id });
    }),
  );

  return router;
}
