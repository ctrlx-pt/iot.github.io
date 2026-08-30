import { Router } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../db/client";
import {
  companyMemberships,
  storeAssignments,
  stores,
  users,
} from "../../db/schema";
import {
  authenticate,
  getMembership,
  requireCompanyRole,
  roleAtLeast,
} from "../../middleware/auth";
import { asyncHandler, fail, ok } from "../../middleware/errors";
import { hashPassword } from "../../services/crypto/password";

const tenantRoles = ["CompanyAdmin", "StoreManager", "Operator", "Viewer"] as const;

const createUserSchema = z.object({
  username: z.string().min(3).max(64),
  password: z.string().min(6),
  email: z.string().email().optional(),
  role: z.enum(tenantRoles),
  storeIds: z.array(z.string().uuid()).default([]),
});

const updateUserSchema = z.object({
  email: z.string().email().nullable().optional(),
  password: z.string().min(6).optional(),
  role: z.enum(tenantRoles).optional(),
  storeIds: z.array(z.string().uuid()).optional(),
  isActive: z.boolean().optional(),
});

function companyIdFromReq(req: { params: { companyId?: string } }) {
  return req.params.companyId!;
}

export function createCompanyUsersRouter(): Router {
  const router = Router({ mergeParams: true });
  router.use(authenticate);

  router.get(
    "/",
    requireCompanyRole("CompanyAdmin", companyIdFromReq),
    asyncHandler(async (req, res) => {
      const companyId = req.params.companyId!;
      const db = getDb();

      const memberships = await db
        .select()
        .from(companyMemberships)
        .where(eq(companyMemberships.companyId, companyId));

      if (!memberships.length) return ok(res, []);

      const userIds = memberships.map((m) => m.userId);
      const userRows = await db.select().from(users).where(inArray(users.id, userIds));
      const assignments = await db
        .select()
        .from(storeAssignments)
        .where(inArray(storeAssignments.userId, userIds));
      const companyStores = await db
        .select({ id: stores.id, name: stores.name, storeCode: stores.storeCode })
        .from(stores)
        .where(eq(stores.companyId, companyId));

      const payload = userRows.map((u) => {
        const membership = memberships.find((m) => m.userId === u.id);
        const userStoreIds = assignments.filter((a) => a.userId === u.id).map((a) => a.storeId);
        return {
          id: u.id,
          username: u.username,
          email: u.email,
          isActive: u.isActive,
          role: membership?.role ?? "Viewer",
          storeIds: userStoreIds,
          stores: companyStores.filter((s) => userStoreIds.includes(s.id)),
          createdAt: u.createdAt,
        };
      });

      return ok(res, payload);
    }),
  );

  router.post(
    "/",
    requireCompanyRole("CompanyAdmin", companyIdFromReq),
    asyncHandler(async (req, res) => {
      const companyId = req.params.companyId!;
      const body = createUserSchema.parse(req.body);
      const db = getDb();

      if (body.role === "SuperAdmin") {
        return fail(res, 403, "Cannot assign SuperAdmin via company API", "FORBIDDEN");
      }

      const companyStores = await db
        .select({ id: stores.id })
        .from(stores)
        .where(eq(stores.companyId, companyId));
      const validStoreIds = new Set(companyStores.map((s) => s.id));
      for (const storeId of body.storeIds) {
        if (!validStoreIds.has(storeId)) {
          return fail(res, 400, `Store ${storeId} does not belong to company`, "BAD_REQUEST");
        }
      }

      const existing = await db.select().from(users).where(eq(users.username, body.username)).limit(1);
      if (existing[0]) return fail(res, 409, "Username already exists", "CONFLICT");

      const [user] = await db
        .insert(users)
        .values({
          username: body.username,
          email: body.email,
          passwordHash: hashPassword(body.password),
          emailVerified: true,
          isActive: true,
        })
        .returning();

      await db.insert(companyMemberships).values({
        userId: user.id,
        companyId,
        role: body.role,
      });

      if (body.storeIds.length) {
        await db.insert(storeAssignments).values(
          body.storeIds.map((storeId) => ({ userId: user.id, storeId })),
        );
      }

      return ok(res, {
        id: user.id,
        username: user.username,
        email: user.email,
        isActive: user.isActive,
        role: body.role,
        storeIds: body.storeIds,
      });
    }),
  );

  router.patch(
    "/:userId",
    requireCompanyRole("CompanyAdmin", companyIdFromReq),
    asyncHandler(async (req, res) => {
      const companyId = req.params.companyId!;
      const userId = req.params.userId;
      const body = updateUserSchema.parse(req.body);
      const db = getDb();

      const membership = await db
        .select()
        .from(companyMemberships)
        .where(and(eq(companyMemberships.companyId, companyId), eq(companyMemberships.userId, userId)))
        .limit(1);

      if (!membership[0]) return fail(res, 404, "User not in company", "NOT_FOUND");

      const targetUser = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!targetUser[0]) return fail(res, 404, "User not found", "NOT_FOUND");
      if (targetUser[0].isSuperAdmin) {
        return fail(res, 403, "Cannot modify SuperAdmin", "FORBIDDEN");
      }

      if (!req.user!.isSuperAdmin) {
        const actorMembership = getMembership(req.user!, companyId);
        if (!actorMembership || !roleAtLeast(actorMembership.role, "CompanyAdmin")) {
          return fail(res, 403, "CompanyAdmin required", "FORBIDDEN");
        }
        if (membership[0].role === "CompanyAdmin" && actorMembership.role !== "CompanyAdmin") {
          return fail(res, 403, "Cannot modify another CompanyAdmin", "FORBIDDEN");
        }
      }

      if (body.storeIds) {
        const companyStores = await db
          .select({ id: stores.id })
          .from(stores)
          .where(eq(stores.companyId, companyId));
        const validStoreIds = new Set(companyStores.map((s) => s.id));
        for (const storeId of body.storeIds) {
          if (!validStoreIds.has(storeId)) {
            return fail(res, 400, `Store ${storeId} does not belong to company`, "BAD_REQUEST");
          }
        }
        await db.delete(storeAssignments).where(eq(storeAssignments.userId, userId));
        if (body.storeIds.length) {
          await db.insert(storeAssignments).values(
            body.storeIds.map((storeId) => ({ userId, storeId })),
          );
        }
      }

      if (body.role) {
        await db
          .update(companyMemberships)
          .set({ role: body.role, updatedAt: new Date() })
          .where(eq(companyMemberships.id, membership[0].id));
      }

      const userPatch: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
      if (body.email !== undefined) userPatch.email = body.email;
      if (body.isActive !== undefined) userPatch.isActive = body.isActive;
      if (body.password) userPatch.passwordHash = hashPassword(body.password);

      const [updated] = await db
        .update(users)
        .set(userPatch)
        .where(eq(users.id, userId))
        .returning();

      const assignments = await db
        .select({ storeId: storeAssignments.storeId })
        .from(storeAssignments)
        .where(eq(storeAssignments.userId, userId));

      return ok(res, {
        id: updated.id,
        username: updated.username,
        email: updated.email,
        isActive: updated.isActive,
        role: body.role ?? membership[0].role,
        storeIds: assignments.map((a) => a.storeId),
      });
    }),
  );

  return router;
}
