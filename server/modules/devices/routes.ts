import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../db/client";
import { devices } from "../../db/schema";
import { authenticate, getMembership, roleAtLeast, type AuthUser } from "../../middleware/auth";
import { asyncHandler, fail, ok } from "../../middleware/errors";
import { writeAuditLog } from "../../services/audit";
import { getDeviceControlService } from "../../services/device-control";
import {
  recordManualHeartbeat,
  refreshDeviceHeartbeat,
} from "../../services/devices/heartbeat";
import { getDeviceScoped, getKitScoped, getStoreForUser } from "../../services/tenant-scope";
import { broadcastDeviceState } from "../../services/realtime";
import { createDeviceTicketsRouter } from "../device-tickets/routes";

const patchDeviceSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  gatewayId: z.string().uuid().nullable().optional(),
  manufacturer: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  serialNumber: z.string().nullable().optional(),
  homeAssistantEntityId: z.string().nullable().optional(),
  configuration: z.record(z.unknown()).optional(),
  capabilities: z.array(z.string()).optional(),
  status: z.string().optional(),
  isActive: z.boolean().optional(),
});

function canEditDeviceMetadata(user: AuthUser | undefined, companyId: string): boolean {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  const m = getMembership(user, companyId);
  return !!m && roleAtLeast(m.role, "StoreManager");
}

export function createDevicesRouter(): Router {
  const router = Router();
  router.use(authenticate);

  router.use("/:deviceId/tickets", createDeviceTicketsRouter());

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const kitId = typeof req.query.kitId === "string" ? req.query.kitId : undefined;
      if (!kitId) return fail(res, 400, "kitId query required", "BAD_REQUEST");
      await getKitScoped(req.user!, kitId);
      const db = getDb();
      const rows = await db
        .select()
        .from(devices)
        .where(eq(devices.kitId, kitId))
        .orderBy(desc(devices.createdAt));
      return ok(res, rows);
    }),
  );

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      const { device } = await getDeviceScoped(req.user!, req.params.id);
      return ok(res, {
        ...device,
        configuration: JSON.parse(device.configuration || "{}"),
        capabilities: JSON.parse(device.capabilities || "[]"),
      });
    }),
  );

  router.get(
    "/:id/state",
    asyncHandler(async (req, res) => {
      await getDeviceScoped(req.user!, req.params.id);
      const state = await getDeviceControlService().getNormalizedState(req.params.id);
      try {
        await refreshDeviceHeartbeat(req.params.id);
      } catch {
        /* ignore heartbeat errors */
      }
      return ok(res, state);
    }),
  );

  router.get(
    "/:id/heartbeat",
    asyncHandler(async (req, res) => {
      await getDeviceScoped(req.user!, req.params.id);
      const heartbeat = await refreshDeviceHeartbeat(req.params.id);
      return ok(res, heartbeat);
    }),
  );

  router.post(
    "/:id/heartbeat",
    asyncHandler(async (req, res) => {
      await getDeviceScoped(req.user!, req.params.id);
      const status = typeof req.body?.status === "string" ? req.body.status : "ONLINE";
      const heartbeat = await recordManualHeartbeat(req.params.id, status);
      return ok(res, heartbeat);
    }),
  );

  router.post(
    "/",
    asyncHandler(async (_req, res) => {
      return fail(
        res,
        410,
        "Devices are discovered automatically from the integration hub. Configure sync and call discover.",
        "DEVICES_AUTO_DISCOVERED",
      );
    }),
  );

  router.post(
    "/:id/control",
    asyncHandler(async (req, res) => {
      const { device, furniture: furn } = await getDeviceScoped(req.user!, req.params.id);
      const store = await getStoreForUser(req.user!, furn.storeId);
      if (!req.user!.isSuperAdmin) {
        const m = getMembership(req.user!, store.companyId);
        if (!m || !roleAtLeast(m.role, "Operator")) {
          return fail(res, 403, "Operator role required to control devices", "FORBIDDEN");
        }
      }
      const command = req.body;
      if (!command?.action) return fail(res, 400, "action required", "BAD_REQUEST");
      const result = await getDeviceControlService().control(device.id, command);
      await writeAuditLog({
        companyId: store.companyId,
        userId: req.user!.id,
        action: `DEVICE_${String(command.action).toUpperCase()}`,
        entityType: "device",
        entityId: device.id,
        newValue: command,
        ipAddress: req.ip,
      });
      broadcastDeviceState(store.companyId, {
        type: "device_state",
        deviceId: device.id,
        deviceCode: device.deviceCode,
        state: result.state,
      });
      return ok(res, result);
    }),
  );

  router.patch(
    "/:id",
    asyncHandler(async (req, res) => {
      const { device, furniture: furn } = await getDeviceScoped(req.user!, req.params.id);
      const store = await getStoreForUser(req.user!, furn.storeId);
      if (!canEditDeviceMetadata(req.user, store.companyId)) {
        return fail(res, 403, "StoreManager role required to update devices", "FORBIDDEN");
      }
      const body = patchDeviceSchema.parse(req.body);
      const db = getDb();
      const [row] = await db
        .update(devices)
        .set({
          name: body.name,
          description: body.description === undefined ? undefined : body.description,
          imageUrl: body.imageUrl === undefined ? undefined : body.imageUrl,
          address: body.address === undefined ? undefined : body.address,
          city: body.city === undefined ? undefined : body.city,
          country: body.country === undefined ? undefined : body.country,
          gatewayId: body.gatewayId === undefined ? undefined : body.gatewayId,
          manufacturer: body.manufacturer === undefined ? undefined : body.manufacturer,
          model: body.model === undefined ? undefined : body.model,
          serialNumber: body.serialNumber === undefined ? undefined : body.serialNumber,
          homeAssistantEntityId:
            req.user!.isSuperAdmin && body.homeAssistantEntityId !== undefined
              ? body.homeAssistantEntityId
              : undefined,
          configuration: body.configuration ? JSON.stringify(body.configuration) : undefined,
          capabilities: body.capabilities ? JSON.stringify(body.capabilities) : undefined,
          status: body.status,
          isActive: body.isActive,
          updatedAt: new Date(),
        })
        .where(eq(devices.id, device.id))
        .returning();
      return ok(res, {
        ...row,
        configuration: JSON.parse(row.configuration || "{}"),
        capabilities: JSON.parse(row.capabilities || "[]"),
      });
    }),
  );

  router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
      const { device, furniture: furn } = await getDeviceScoped(req.user!, req.params.id);
      const store = await getStoreForUser(req.user!, furn.storeId);
      if (!req.user!.isSuperAdmin) {
        return fail(res, 403, "Only SuperAdmin can delete devices", "FORBIDDEN");
      }
      const db = getDb();
      await db.delete(devices).where(eq(devices.id, device.id));
      return ok(res, { id: device.id });
    }),
  );

  return router;
}
