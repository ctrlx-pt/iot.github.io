import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../db/client";
import { deviceTickets, TICKET_PRIORITIES, TICKET_STATUSES } from "../../db/schema";
import { authenticate, getMembership, roleAtLeast } from "../../middleware/auth";
import { asyncHandler, fail, ok } from "../../middleware/errors";
import { getDeviceScoped, getStoreForUser } from "../../services/tenant-scope";

const createTicketSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
});

const updateTicketSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  assignedToUserId: z.string().uuid().nullable().optional(),
});

export function createDeviceTicketsRouter(): Router {
  const router = Router({ mergeParams: true });
  router.use(authenticate);

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const deviceId = req.params.deviceId!;
      await getDeviceScoped(req.user!, deviceId);
      const db = getDb();
      const rows = await db
        .select()
        .from(deviceTickets)
        .where(eq(deviceTickets.deviceId, deviceId))
        .orderBy(desc(deviceTickets.createdAt));
      return ok(res, rows);
    }),
  );

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const deviceId = req.params.deviceId!;
      const { furniture: furn } = await getDeviceScoped(req.user!, deviceId);
      const store = await getStoreForUser(req.user!, furn.storeId);
      if (!req.user!.isSuperAdmin) {
        const m = getMembership(req.user!, store.companyId);
        if (!m || !roleAtLeast(m.role, "Operator")) {
          return fail(res, 403, "Operator role required", "FORBIDDEN");
        }
      }
      const body = createTicketSchema.parse(req.body);
      const db = getDb();
      const [row] = await db
        .insert(deviceTickets)
        .values({
          deviceId,
          title: body.title,
          description: body.description,
          priority: body.priority ?? "MEDIUM",
          createdByUserId: req.user!.id,
        })
        .returning();
      return ok(res, row);
    }),
  );

  router.patch(
    "/:ticketId",
    asyncHandler(async (req, res) => {
      const deviceId = req.params.deviceId!;
      const ticketId = req.params.ticketId;
      const { furniture: furn } = await getDeviceScoped(req.user!, deviceId);
      const store = await getStoreForUser(req.user!, furn.storeId);
      if (!req.user!.isSuperAdmin) {
        const m = getMembership(req.user!, store.companyId);
        if (!m || !roleAtLeast(m.role, "Operator")) {
          return fail(res, 403, "Operator role required", "FORBIDDEN");
        }
      }
      const body = updateTicketSchema.parse(req.body);
      const db = getDb();
      const existing = await db
        .select()
        .from(deviceTickets)
        .where(and(eq(deviceTickets.id, ticketId), eq(deviceTickets.deviceId, deviceId)))
        .limit(1);
      if (!existing[0]) return fail(res, 404, "Ticket not found", "NOT_FOUND");

      const [row] = await db
        .update(deviceTickets)
        .set({
          title: body.title,
          description: body.description === undefined ? undefined : body.description,
          status: body.status,
          priority: body.priority,
          assignedToUserId:
            body.assignedToUserId === undefined ? undefined : body.assignedToUserId,
          updatedAt: new Date(),
        })
        .where(eq(deviceTickets.id, ticketId))
        .returning();
      return ok(res, row);
    }),
  );

  return router;
}
