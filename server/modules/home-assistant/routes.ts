import { Router } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../db/client";
import { homeAssistantEntities, homeAssistantInstances } from "../../db/schema";
import { authenticate, getMembership, roleAtLeast } from "../../middleware/auth";
import { asyncHandler, fail, ok } from "../../middleware/errors";
import { writeAuditLog } from "../../services/audit";
import { encryptSecret } from "../../services/crypto/secrets";
import { discoverDevicesFromHomeAssistant } from "../../services/home-assistant/discover";
import {
  createAutomationForInstance,
  deleteAutomationForInstance,
  listAutomationsForInstance,
  setAutomationEnabled,
  triggerAutomationForInstance,
  updateAutomationForInstance,
} from "../../services/home-assistant/automations";
import { getDeviceScoped, getStoreForUser } from "../../services/tenant-scope";
import { normalizeHomeAssistantBaseUrl } from "../../../shared/ha-url";

function sanitizeHa(row: typeof homeAssistantInstances.$inferSelect) {
  const { apiTokenEncrypted: _, ...rest } = row;
  return rest;
}

export function createHomeAssistantRouter(): Router {
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
        .from(homeAssistantInstances)
        .where(eq(homeAssistantInstances.storeId, storeId));
      return ok(res, rows.map(sanitizeHa));
    }),
  );

  router.get(
    "/entities/list",
    asyncHandler(async (req, res) => {
      const instanceId =
        typeof req.query.instanceId === "string" ? req.query.instanceId : undefined;
      if (!instanceId) return fail(res, 400, "instanceId required", "BAD_REQUEST");
      const db = getDb();
      const inst = await db
        .select()
        .from(homeAssistantInstances)
        .where(eq(homeAssistantInstances.id, instanceId))
        .limit(1);
      if (!inst[0]) return fail(res, 404, "Not found", "NOT_FOUND");
      await getStoreForUser(req.user!, inst[0].storeId);
      const rows = await db
        .select()
        .from(homeAssistantEntities)
        .where(eq(homeAssistantEntities.homeAssistantInstanceId, instanceId));
      return ok(res, rows);
    }),
  );

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(homeAssistantInstances)
        .where(eq(homeAssistantInstances.id, req.params.id))
        .limit(1);
      const inst = rows[0];
      if (!inst) return fail(res, 404, "Home Assistant instance not found", "NOT_FOUND");
      await getStoreForUser(req.user!, inst.storeId);
      return ok(res, sanitizeHa(inst));
    }),
  );

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const parsed = z
        .object({
          storeId: z.string().uuid(),
          name: z.string().min(1),
          url: z.string().min(1),
          apiToken: z.string().min(1),
        })
        .safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 422, "Validation failed", "VALIDATION_ERROR", parsed.error.issues);
      }
      let url: string;
      try {
        url = normalizeHomeAssistantBaseUrl(parsed.data.url);
      } catch (err: any) {
        return fail(res, 422, err?.message || "Invalid Home Assistant URL", "VALIDATION_ERROR");
      }
      const store = await getStoreForUser(req.user!, parsed.data.storeId);
      if (!req.user!.isSuperAdmin) {
        return fail(res, 403, "Only SuperAdmin can connect Home Assistant", "FORBIDDEN");
      }
      const db = getDb();
      const [row] = await db
        .insert(homeAssistantInstances)
        .values({
          storeId: store.id,
          name: parsed.data.name,
          url,
          apiTokenEncrypted: encryptSecret(parsed.data.apiToken),
          status: "UNKNOWN",
        })
        .returning();
      await writeAuditLog({
        companyId: store.companyId,
        userId: req.user!.id,
        action: "HA_INSTANCE_CREATED",
        entityType: "home_assistant",
        entityId: row.id,
        ipAddress: req.ip,
      });

      // Auto-discover devices right after connecting HA
      let discovery = null;
      try {
        discovery = await discoverDevicesFromHomeAssistant(row.id);
        await writeAuditLog({
          companyId: store.companyId,
          userId: req.user!.id,
          action: "HA_DEVICES_DISCOVERED",
          entityType: "home_assistant",
          entityId: row.id,
          newValue: {
            discovered: discovery.discovered,
            created: discovery.created,
            updated: discovery.updated,
          },
          ipAddress: req.ip,
        });
      } catch (err: any) {
        // Instance is saved even if discovery fails (wrong token / HA offline)
        discovery = { error: err?.message || "Discovery failed" };
      }

      return ok(res, { ...sanitizeHa(row), discovery }, 201);
    }),
  );

  router.patch(
    "/:id",
    asyncHandler(async (req, res) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(homeAssistantInstances)
        .where(eq(homeAssistantInstances.id, req.params.id))
        .limit(1);
      const inst = rows[0];
      if (!inst) return fail(res, 404, "Not found", "NOT_FOUND");
      const store = await getStoreForUser(req.user!, inst.storeId);
      if (!req.user!.isSuperAdmin) {
        return fail(res, 403, "Only SuperAdmin can update Home Assistant", "FORBIDDEN");
      }
      const parsed = z
        .object({
          name: z.string().min(1).optional(),
          url: z.string().min(1).optional(),
          apiToken: z.string().min(1).optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 422, "Validation failed", "VALIDATION_ERROR", parsed.error.issues);
      }
      let url = inst.url;
      if (parsed.data.url) {
        try {
          url = normalizeHomeAssistantBaseUrl(parsed.data.url);
        } catch (err: any) {
          return fail(res, 422, err?.message || "Invalid Home Assistant URL", "VALIDATION_ERROR");
        }
      }
      const [row] = await db
        .update(homeAssistantInstances)
        .set({
          name: parsed.data.name ?? inst.name,
          url,
          apiTokenEncrypted: parsed.data.apiToken
            ? encryptSecret(parsed.data.apiToken)
            : undefined,
          updatedAt: new Date(),
        })
        .where(eq(homeAssistantInstances.id, inst.id))
        .returning();
      return ok(res, sanitizeHa(row));
    }),
  );

  router.get(
    "/:id/automations",
    asyncHandler(async (req, res) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(homeAssistantInstances)
        .where(eq(homeAssistantInstances.id, req.params.id))
        .limit(1);
      const inst = rows[0];
      if (!inst) return fail(res, 404, "Not found", "NOT_FOUND");
      await getStoreForUser(req.user!, inst.storeId);
      try {
        const automations = await listAutomationsForInstance(inst.id);
        return ok(res, { instance: sanitizeHa(inst), automations });
      } catch (err: any) {
        return fail(res, 502, err?.message || "Failed to load automations", "INTEGRATION_UNAVAILABLE");
      }
    }),
  );

  router.post(
    "/:id/automations",
    asyncHandler(async (req, res) => {
      const parsed = z
        .object({
          name: z.string().min(1),
          time: z.string().min(1),
          deviceEntityId: z.string().min(1),
          action: z.enum(["on", "off"]),
        })
        .safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 422, "Validation failed", "VALIDATION_ERROR", parsed.error.issues);
      }
      const db = getDb();
      const rows = await db
        .select()
        .from(homeAssistantInstances)
        .where(eq(homeAssistantInstances.id, req.params.id))
        .limit(1);
      const inst = rows[0];
      if (!inst) return fail(res, 404, "Not found", "NOT_FOUND");
      const store = await getStoreForUser(req.user!, inst.storeId);
      if (!req.user!.isSuperAdmin) {
        return fail(res, 403, "Only SuperAdmin can manage automations", "FORBIDDEN");
      }
      try {
        const created = await createAutomationForInstance(inst.id, parsed.data);
        return ok(res, created, 201);
      } catch (err: any) {
        return fail(res, 502, err?.message || "Failed to create automation", "INTEGRATION_UNAVAILABLE");
      }
    }),
  );

  router.patch(
    "/:id/automations/:configId",
    asyncHandler(async (req, res) => {
      const parsed = z
        .object({
          name: z.string().min(1),
          time: z.string().min(1),
          deviceEntityId: z.string().min(1),
          action: z.enum(["on", "off"]),
        })
        .safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 422, "Validation failed", "VALIDATION_ERROR", parsed.error.issues);
      }
      const db = getDb();
      const rows = await db
        .select()
        .from(homeAssistantInstances)
        .where(eq(homeAssistantInstances.id, req.params.id))
        .limit(1);
      const inst = rows[0];
      if (!inst) return fail(res, 404, "Not found", "NOT_FOUND");
      await getStoreForUser(req.user!, inst.storeId);
      if (!req.user!.isSuperAdmin) {
        return fail(res, 403, "Only SuperAdmin can manage automations", "FORBIDDEN");
      }
      try {
        const updated = await updateAutomationForInstance(
          inst.id,
          req.params.configId,
          parsed.data,
        );
        return ok(res, updated);
      } catch (err: any) {
        return fail(res, 502, err?.message || "Failed to update automation", "INTEGRATION_UNAVAILABLE");
      }
    }),
  );

  router.delete(
    "/:id/automations/:configId",
    asyncHandler(async (req, res) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(homeAssistantInstances)
        .where(eq(homeAssistantInstances.id, req.params.id))
        .limit(1);
      const inst = rows[0];
      if (!inst) return fail(res, 404, "Not found", "NOT_FOUND");
      await getStoreForUser(req.user!, inst.storeId);
      if (!req.user!.isSuperAdmin) {
        return fail(res, 403, "Only SuperAdmin can manage automations", "FORBIDDEN");
      }
      try {
        await deleteAutomationForInstance(inst.id, req.params.configId);
        return ok(res, { configId: req.params.configId });
      } catch (err: any) {
        return fail(res, 502, err?.message || "Failed to delete automation", "INTEGRATION_UNAVAILABLE");
      }
    }),
  );

  router.post(
    "/:id/automations/trigger",
    asyncHandler(async (req, res) => {
      const entityId = typeof req.body?.entityId === "string" ? req.body.entityId : "";
      if (!entityId) return fail(res, 400, "entityId required", "BAD_REQUEST");
      const db = getDb();
      const rows = await db
        .select()
        .from(homeAssistantInstances)
        .where(eq(homeAssistantInstances.id, req.params.id))
        .limit(1);
      const inst = rows[0];
      if (!inst) return fail(res, 404, "Not found", "NOT_FOUND");
      const store = await getStoreForUser(req.user!, inst.storeId);
      if (!req.user!.isSuperAdmin) {
        const m = getMembership(req.user!, store.companyId);
        if (!m || !roleAtLeast(m.role, "Operator")) {
          return fail(res, 403, "Operator required", "FORBIDDEN");
        }
      }
      try {
        await triggerAutomationForInstance(inst.id, entityId);
        return ok(res, { entityId });
      } catch (err: any) {
        return fail(res, 502, err?.message || "Failed to trigger automation", "INTEGRATION_UNAVAILABLE");
      }
    }),
  );

  router.post(
    "/:id/automations/enable",
    asyncHandler(async (req, res) => {
      const entityId = typeof req.body?.entityId === "string" ? req.body.entityId : "";
      const enabled = req.body?.enabled !== false;
      if (!entityId) return fail(res, 400, "entityId required", "BAD_REQUEST");
      const db = getDb();
      const rows = await db
        .select()
        .from(homeAssistantInstances)
        .where(eq(homeAssistantInstances.id, req.params.id))
        .limit(1);
      const inst = rows[0];
      if (!inst) return fail(res, 404, "Not found", "NOT_FOUND");
      const store = await getStoreForUser(req.user!, inst.storeId);
      if (!req.user!.isSuperAdmin) {
        return fail(res, 403, "Only SuperAdmin can manage automations", "FORBIDDEN");
      }
      try {
        await setAutomationEnabled(inst.id, entityId, enabled);
        return ok(res, { entityId, enabled });
      } catch (err: any) {
        return fail(res, 502, err?.message || "Failed to update automation", "INTEGRATION_UNAVAILABLE");
      }
    }),
  );

  router.post(
    "/:id/discover",
    asyncHandler(async (req, res) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(homeAssistantInstances)
        .where(eq(homeAssistantInstances.id, req.params.id))
        .limit(1);
      const inst = rows[0];
      if (!inst) return fail(res, 404, "Not found", "NOT_FOUND");
      const store = await getStoreForUser(req.user!, inst.storeId);
      if (!req.user!.isSuperAdmin) {
        const m = getMembership(req.user!, store.companyId);
        if (!m || !roleAtLeast(m.role, "Operator")) {
          return fail(res, 403, "Operator required", "FORBIDDEN");
        }
      }
      try {
        const discovery = await discoverDevicesFromHomeAssistant(inst.id);
        await writeAuditLog({
          companyId: store.companyId,
          userId: req.user!.id,
          action: "HA_DEVICES_DISCOVERED",
          entityType: "home_assistant",
          entityId: inst.id,
          newValue: {
            discovered: discovery.discovered,
            created: discovery.created,
            updated: discovery.updated,
          },
          ipAddress: req.ip,
        });
        return ok(res, discovery);
      } catch (err: any) {
        await db
          .update(homeAssistantInstances)
          .set({ status: "OFFLINE", updatedAt: new Date() })
          .where(eq(homeAssistantInstances.id, inst.id));
        return fail(res, 502, err?.message || "Discovery failed", "HA_UNAVAILABLE");
      }
    }),
  );

  router.post(
    "/:id/ping",
    asyncHandler(async (req, res) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(homeAssistantInstances)
        .where(eq(homeAssistantInstances.id, req.params.id))
        .limit(1);
      const inst = rows[0];
      if (!inst) return fail(res, 404, "Not found", "NOT_FOUND");
      await getStoreForUser(req.user!, inst.storeId);
      try {
        // Ping = connectivity check + full device discovery
        const discovery = await discoverDevicesFromHomeAssistant(inst.id);
        const [updated] = await db
          .select()
          .from(homeAssistantInstances)
          .where(eq(homeAssistantInstances.id, inst.id))
          .limit(1);
        return ok(res, {
          instance: sanitizeHa(updated!),
          entityCount: discovery.discovered,
          discovery,
        });
      } catch (err: any) {
        await db
          .update(homeAssistantInstances)
          .set({ status: "OFFLINE", updatedAt: new Date() })
          .where(eq(homeAssistantInstances.id, inst.id));
        return fail(res, 502, err?.message || "HA ping failed", "HA_UNAVAILABLE");
      }
    }),
  );

  router.post(
    "/entities",
    asyncHandler(async (req, res) => {
      const parsed = z
        .object({
          homeAssistantInstanceId: z.string().uuid(),
          deviceId: z.string().uuid(),
          entityId: z.string().min(1),
          entityType: z.string().min(1),
          friendlyName: z.string().optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 422, "Validation failed", "VALIDATION_ERROR", parsed.error.issues);
      }
      await getDeviceScoped(req.user!, parsed.data.deviceId);
      const db = getDb();
      const inst = await db
        .select()
        .from(homeAssistantInstances)
        .where(eq(homeAssistantInstances.id, parsed.data.homeAssistantInstanceId))
        .limit(1);
      if (!inst[0]) return fail(res, 404, "HA instance not found", "NOT_FOUND");
      const store = await getStoreForUser(req.user!, inst[0].storeId);
      if (!req.user!.isSuperAdmin) {
        return fail(res, 403, "Only SuperAdmin can map HA entities", "FORBIDDEN");
      }
      const [row] = await db
        .insert(homeAssistantEntities)
        .values({
          homeAssistantInstanceId: parsed.data.homeAssistantInstanceId,
          deviceId: parsed.data.deviceId,
          entityId: parsed.data.entityId,
          entityType: parsed.data.entityType,
          friendlyName: parsed.data.friendlyName,
        })
        .returning();
      const { devices } = await import("../../db/schema");
      await db
        .update(devices)
        .set({ homeAssistantEntityId: parsed.data.entityId, updatedAt: new Date() })
        .where(eq(devices.id, parsed.data.deviceId));
      return ok(res, row, 201);
    }),
  );

  router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(homeAssistantInstances)
        .where(eq(homeAssistantInstances.id, req.params.id))
        .limit(1);
      const inst = rows[0];
      if (!inst) return fail(res, 404, "Not found", "NOT_FOUND");
      const store = await getStoreForUser(req.user!, inst.storeId);
      if (!req.user!.isSuperAdmin) {
        return fail(res, 403, "Only SuperAdmin can remove Home Assistant", "FORBIDDEN");
      }
      await db.delete(homeAssistantInstances).where(eq(homeAssistantInstances.id, inst.id));
      return ok(res, { id: inst.id });
    }),
  );

  return router;
}
