import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../db/client";
import { kits } from "../../db/schema";
import { authenticate } from "../../middleware/auth";
import { asyncHandler, fail, ok } from "../../middleware/errors";
import { writeAuditLog } from "../../services/audit";
import { identifierGenerator } from "../../services/identifier-generator";
import { getFurnitureScoped, getKitScoped, getStoreForUser } from "../../services/tenant-scope";

export function createKitsRouter(): Router {
  const router = Router();
  router.use(authenticate);

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const furnitureId = typeof req.query.furnitureId === "string" ? req.query.furnitureId : undefined;
      if (!furnitureId) return fail(res, 400, "furnitureId query required", "BAD_REQUEST");
      await getFurnitureScoped(req.user!, furnitureId);
      const db = getDb();
      const rows = await db
        .select()
        .from(kits)
        .where(eq(kits.furnitureId, furnitureId))
        .orderBy(desc(kits.createdAt));
      return ok(res, rows);
    }),
  );

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      const { kit } = await getKitScoped(req.user!, req.params.id);
      return ok(res, kit);
    }),
  );

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const parsed = z
        .object({
          furnitureId: z.string().uuid(),
          name: z.string().min(1),
          description: z.string().optional(),
          kitType: z.string().optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 422, "Validation failed", "VALIDATION_ERROR", parsed.error.issues);
      }
      const furn = await getFurnitureScoped(req.user!, parsed.data.furnitureId);
      const store = await getStoreForUser(req.user!, furn.storeId);
      if (!req.user!.isSuperAdmin) {
        return fail(res, 403, "Only SuperAdmin can create kits", "FORBIDDEN");
      }
      const kitCode = await identifierGenerator.generateKitCode(store.storeCode);
      const db = getDb();
      const [row] = await db
        .insert(kits)
        .values({
          kitCode,
          furnitureId: furn.id,
          name: parsed.data.name,
          description: parsed.data.description,
          kitType: parsed.data.kitType ?? "standard",
          status: "ONLINE",
        })
        .returning();
      await writeAuditLog({
        companyId: store.companyId,
        userId: req.user!.id,
        action: "KIT_CREATED",
        entityType: "kit",
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
      const { kit, furniture: furn } = await getKitScoped(req.user!, req.params.id);
      const store = await getStoreForUser(req.user!, furn.storeId);
      if (!req.user!.isSuperAdmin) {
        return fail(res, 403, "Only SuperAdmin can update kits", "FORBIDDEN");
      }
      const body = z
        .object({
          name: z.string().min(1).optional(),
          description: z.string().nullable().optional(),
          kitType: z.string().optional(),
          status: z.string().optional(),
          isActive: z.boolean().optional(),
        })
        .parse(req.body);
      const db = getDb();
      const [row] = await db
        .update(kits)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(kits.id, kit.id))
        .returning();
      return ok(res, row);
    }),
  );

  router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
      const { kit, furniture: furn } = await getKitScoped(req.user!, req.params.id);
      const store = await getStoreForUser(req.user!, furn.storeId);
      if (!req.user!.isSuperAdmin) {
        return fail(res, 403, "Only SuperAdmin can delete kits", "FORBIDDEN");
      }
      const db = getDb();
      await db.delete(kits).where(eq(kits.id, kit.id));
      return ok(res, { id: kit.id });
    }),
  );

  return router;
}
