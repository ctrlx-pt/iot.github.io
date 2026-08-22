import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../db/client";
import { furniture, stores } from "../../db/schema";
import { authenticate } from "../../middleware/auth";
import { asyncHandler, fail, ok } from "../../middleware/errors";
import { writeAuditLog } from "../../services/audit";
import { identifierGenerator } from "../../services/identifier-generator";
import { getFurnitureScoped, getStoreForUser } from "../../services/tenant-scope";

const createSchema = z.object({
  storeId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  position: z.string().optional(),
});

export function createFurnitureRouter(): Router {
  const router = Router();
  router.use(authenticate);

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const storeId = typeof req.query.storeId === "string" ? req.query.storeId : undefined;
      if (!storeId) return fail(res, 400, "storeId query required", "BAD_REQUEST");
      await getStoreForUser(req.user!, storeId);
      const db = getDb();
      const rows = await db
        .select()
        .from(furniture)
        .where(eq(furniture.storeId, storeId))
        .orderBy(desc(furniture.createdAt));
      return ok(res, rows);
    }),
  );

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      const item = await getFurnitureScoped(req.user!, req.params.id);
      return ok(res, item);
    }),
  );

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 422, "Validation failed", "VALIDATION_ERROR", parsed.error.issues);
      }
      const store = await getStoreForUser(req.user!, parsed.data.storeId);
      if (!req.user!.isSuperAdmin) {
        return fail(res, 403, "Only SuperAdmin can create furniture", "FORBIDDEN");
      }
      const furnitureCode = await identifierGenerator.generateFurnitureCode(store.storeCode);
      const db = getDb();
      const [row] = await db
        .insert(furniture)
        .values({
          furnitureCode,
          storeId: store.id,
          name: parsed.data.name,
          description: parsed.data.description,
          position: parsed.data.position,
          status: "ONLINE",
        })
        .returning();
      await writeAuditLog({
        companyId: store.companyId,
        userId: req.user!.id,
        action: "FURNITURE_CREATED",
        entityType: "furniture",
        entityId: row.id,
        newValue: row,
        ipAddress: req.ip,
      });
      return ok(res, row, 201);
    }),
  );

  router.patch(
    "/:id",
    asyncHandler(async (req, res) => {
      const item = await getFurnitureScoped(req.user!, req.params.id);
      const store = await getStoreForUser(req.user!, item.storeId);
      if (!req.user!.isSuperAdmin) {
        return fail(res, 403, "Only SuperAdmin can update furniture", "FORBIDDEN");
      }
      const body = z
        .object({
          name: z.string().min(1).optional(),
          description: z.string().nullable().optional(),
          position: z.string().nullable().optional(),
          status: z.string().optional(),
          isActive: z.boolean().optional(),
        })
        .parse(req.body);
      const db = getDb();
      const [row] = await db
        .update(furniture)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(furniture.id, item.id))
        .returning();
      return ok(res, row);
    }),
  );

  router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
      const item = await getFurnitureScoped(req.user!, req.params.id);
      const store = await getStoreForUser(req.user!, item.storeId);
      if (!req.user!.isSuperAdmin) {
        return fail(res, 403, "Only SuperAdmin can delete furniture", "FORBIDDEN");
      }
      const db = getDb();
      await db.delete(furniture).where(eq(furniture.id, item.id));
      return ok(res, { id: item.id });
    }),
  );

  return router;
}
