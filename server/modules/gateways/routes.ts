import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../db/client";
import { gateways } from "../../db/schema";
import { authenticate } from "../../middleware/auth";
import { asyncHandler, fail, ok } from "../../middleware/errors";
import { writeAuditLog } from "../../services/audit";
import { identifierGenerator } from "../../services/identifier-generator";
import { getStoreForUser } from "../../services/tenant-scope";

export function createGatewaysRouter(): Router {
  const router = Router();
  router.use(authenticate);

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const storeId = typeof req.query.storeId === "string" ? req.query.storeId : undefined;
      const db = getDb();
      if (storeId) {
        await getStoreForUser(req.user!, storeId);
        const rows = await db.select().from(gateways).where(eq(gateways.storeId, storeId));
        return ok(res, rows);
      }
      // SuperAdmin: all; others filtered via stores they can access — keep simple: require storeId for non-super
      if (!req.user!.isSuperAdmin) {
        return fail(res, 400, "storeId query required", "BAD_REQUEST");
      }
      const rows = await db.select().from(gateways).orderBy(desc(gateways.createdAt));
      return ok(res, rows);
    }),
  );

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      const db = getDb();
      const rows = await db.select().from(gateways).where(eq(gateways.id, req.params.id)).limit(1);
      const gw = rows[0];
      if (!gw) return fail(res, 404, "Gateway not found", "NOT_FOUND");
      await getStoreForUser(req.user!, gw.storeId);
      return ok(res, gw);
    }),
  );

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const parsed = z
        .object({
          storeId: z.string().uuid(),
          name: z.string().min(1),
          serialNumber: z.string().optional(),
          ipAddress: z.string().optional(),
          macAddress: z.string().optional(),
          homeAssistantInstanceId: z.string().uuid().optional(),
          version: z.string().optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 422, "Validation failed", "VALIDATION_ERROR", parsed.error.issues);
      }
      const store = await getStoreForUser(req.user!, parsed.data.storeId);
      if (!req.user!.isSuperAdmin) {
        return fail(res, 403, "Only SuperAdmin can register gateways", "FORBIDDEN");
      }
      const hardwareId = await identifierGenerator.generateGatewayHardwareId();
      const db = getDb();
      const [row] = await db
        .insert(gateways)
        .values({
          hardwareId,
          name: parsed.data.name,
          storeId: store.id,
          serialNumber: parsed.data.serialNumber,
          ipAddress: parsed.data.ipAddress,
          macAddress: parsed.data.macAddress,
          homeAssistantInstanceId: parsed.data.homeAssistantInstanceId,
          version: parsed.data.version,
          status: "ONLINE",
          lastSeenAt: new Date(),
        })
        .returning();
      await writeAuditLog({
        companyId: store.companyId,
        userId: req.user!.id,
        action: "GATEWAY_CONNECTED",
        entityType: "gateway",
        entityId: row.id,
        newValue: { hardwareId },
        ipAddress: req.ip,
      });
      return ok(res, row, 201);
    }),
  );

  router.patch(
    "/:id",
    asyncHandler(async (req, res) => {
      const db = getDb();
      const rows = await db.select().from(gateways).where(eq(gateways.id, req.params.id)).limit(1);
      const gw = rows[0];
      if (!gw) return fail(res, 404, "Gateway not found", "NOT_FOUND");
      const store = await getStoreForUser(req.user!, gw.storeId);
      if (!req.user!.isSuperAdmin) {
        return fail(res, 403, "Only SuperAdmin can update gateways", "FORBIDDEN");
      }
      const body = z
        .object({
          name: z.string().min(1).optional(),
          serialNumber: z.string().nullable().optional(),
          ipAddress: z.string().nullable().optional(),
          macAddress: z.string().nullable().optional(),
          homeAssistantInstanceId: z.string().uuid().nullable().optional(),
          status: z.string().optional(),
          version: z.string().nullable().optional(),
          isActive: z.boolean().optional(),
        })
        .parse(req.body);
      const [row] = await db
        .update(gateways)
        .set({ ...body, updatedAt: new Date(), lastSeenAt: new Date() })
        .where(eq(gateways.id, gw.id))
        .returning();
      return ok(res, row);
    }),
  );

  router.post(
    "/:id/heartbeat",
    asyncHandler(async (req, res) => {
      const db = getDb();
      const rows = await db.select().from(gateways).where(eq(gateways.id, req.params.id)).limit(1);
      const gw = rows[0];
      if (!gw) return fail(res, 404, "Gateway not found", "NOT_FOUND");
      await getStoreForUser(req.user!, gw.storeId);
      const [row] = await db
        .update(gateways)
        .set({
          status: "ONLINE",
          lastSeenAt: new Date(),
          version: typeof req.body?.version === "string" ? req.body.version : gw.version,
          updatedAt: new Date(),
        })
        .where(eq(gateways.id, gw.id))
        .returning();
      return ok(res, row);
    }),
  );

  router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
      const db = getDb();
      const rows = await db.select().from(gateways).where(eq(gateways.id, req.params.id)).limit(1);
      const gw = rows[0];
      if (!gw) return fail(res, 404, "Gateway not found", "NOT_FOUND");
      const store = await getStoreForUser(req.user!, gw.storeId);
      if (!req.user!.isSuperAdmin) {
        return fail(res, 403, "Only SuperAdmin can delete gateways", "FORBIDDEN");
      }
      await db.delete(gateways).where(eq(gateways.id, gw.id));
      return ok(res, { id: gw.id });
    }),
  );

  return router;
}
