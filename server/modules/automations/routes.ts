import { Router } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../db/client";
import { automations } from "../../db/schema";
import {
  accessibleCompanyIds,
  authenticate,
  canAccessCompany,
  getMembership,
  roleAtLeast,
} from "../../middleware/auth";
import { asyncHandler, fail, ok } from "../../middleware/errors";
import { writeAuditLog } from "../../services/audit";
import { runAutomationNow } from "../../services/automations/runner";

export function createAutomationsRouter(): Router {
  const router = Router();
  router.use(authenticate);

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const db = getDb();
      const scope = accessibleCompanyIds(req.user!);
      const rows =
        scope === "all"
          ? await db.select().from(automations).orderBy(desc(automations.createdAt))
          : scope.length === 0
            ? []
            : await db
                .select()
                .from(automations)
                .where(inArray(automations.companyId, scope))
                .orderBy(desc(automations.createdAt));
      return ok(
        res,
        rows
          .map((r) => ({ ...r, configuration: JSON.parse(r.configuration || "{}") }))
          .filter((r) => {
            const deviceId =
              typeof req.query.deviceId === "string" ? req.query.deviceId : undefined;
            if (!deviceId) return true;
            if (r.scopeType === "Device" && r.scopeId === deviceId) return true;
            const actions = (r.configuration as { actions?: Array<{ deviceId?: string }> })
              .actions;
            return (actions || []).some((a) => a.deviceId === deviceId);
          }),
      );
    }),
  );

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const parsed = z
        .object({
          companyId: z.string().uuid(),
          name: z.string().min(1),
          description: z.string().optional(),
          scopeType: z.enum(["Company", "Store", "Furniture", "Kit", "Device"]),
          scopeId: z.string().min(1),
          triggerType: z.enum(["time", "manual", "device_state", "schedule", "webhook", "sensor"]),
          configuration: z.record(z.unknown()).default({}),
          isEnabled: z.boolean().optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 422, "Validation failed", "VALIDATION_ERROR", parsed.error.issues);
      }
      if (!canAccessCompany(req.user!, parsed.data.companyId)) {
        return fail(res, 403, "No access", "FORBIDDEN");
      }
      if (!req.user!.isSuperAdmin) {
        return fail(res, 403, "Only SuperAdmin can create automations", "FORBIDDEN");
      }
      const db = getDb();
      const [row] = await db
        .insert(automations)
        .values({
          companyId: parsed.data.companyId,
          name: parsed.data.name,
          description: parsed.data.description,
          scopeType: parsed.data.scopeType,
          scopeId: parsed.data.scopeId,
          triggerType: parsed.data.triggerType,
          configuration: JSON.stringify(parsed.data.configuration),
          isEnabled: parsed.data.isEnabled ?? true,
        })
        .returning();
      await writeAuditLog({
        companyId: parsed.data.companyId,
        userId: req.user!.id,
        action: "AUTOMATION_CREATED",
        entityType: "automation",
        entityId: row.id,
        ipAddress: req.ip,
      });
      return ok(res, { ...row, configuration: parsed.data.configuration }, 201);
    }),
  );

  router.post(
    "/:id/run",
    asyncHandler(async (req, res) => {
      const db = getDb();
      const rows = await db.select().from(automations).where(eq(automations.id, req.params.id)).limit(1);
      const auto = rows[0];
      if (!auto) return fail(res, 404, "Not found", "NOT_FOUND");
      if (!canAccessCompany(req.user!, auto.companyId)) {
        return fail(res, 403, "No access", "FORBIDDEN");
      }
      if (!req.user!.isSuperAdmin) {
        const m = getMembership(req.user!, auto.companyId);
        if (!m || !roleAtLeast(m.role, "Operator")) {
          return fail(res, 403, "Operator required", "FORBIDDEN");
        }
      }
      const result = await runAutomationNow(auto);
      await writeAuditLog({
        companyId: auto.companyId,
        userId: req.user!.id,
        action: "AUTOMATION_RUN",
        entityType: "automation",
        entityId: auto.id,
        newValue: result,
        ipAddress: req.ip,
      });
      return ok(res, result);
    }),
  );

  router.patch(
    "/:id",
    asyncHandler(async (req, res) => {
      const db = getDb();
      const rows = await db.select().from(automations).where(eq(automations.id, req.params.id)).limit(1);
      const auto = rows[0];
      if (!auto) return fail(res, 404, "Not found", "NOT_FOUND");
      if (!canAccessCompany(req.user!, auto.companyId)) {
        return fail(res, 403, "No access", "FORBIDDEN");
      }
      const body = z
        .object({
          name: z.string().min(1).optional(),
          description: z.string().nullable().optional(),
          configuration: z.record(z.unknown()).optional(),
          isEnabled: z.boolean().optional(),
          triggerType: z.string().optional(),
        })
        .parse(req.body);
      const [row] = await db
        .update(automations)
        .set({
          name: body.name,
          description: body.description === undefined ? undefined : body.description,
          configuration: body.configuration ? JSON.stringify(body.configuration) : undefined,
          isEnabled: body.isEnabled,
          triggerType: body.triggerType,
          updatedAt: new Date(),
        })
        .where(eq(automations.id, auto.id))
        .returning();
      return ok(res, { ...row, configuration: JSON.parse(row.configuration || "{}") });
    }),
  );

  router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
      const db = getDb();
      const rows = await db.select().from(automations).where(eq(automations.id, req.params.id)).limit(1);
      const auto = rows[0];
      if (!auto) return fail(res, 404, "Not found", "NOT_FOUND");
      if (!canAccessCompany(req.user!, auto.companyId)) {
        return fail(res, 403, "No access", "FORBIDDEN");
      }
      await db.delete(automations).where(eq(automations.id, auto.id));
      return ok(res, { id: auto.id });
    }),
  );

  return router;
}
