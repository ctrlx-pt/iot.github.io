import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { companyMemberships, storeAssignments, users, type PlatformRole } from "../db/schema";
import { verifyJwt } from "../services/crypto/jwt";
import { AppError, fail } from "./errors";

export type AuthUser = {
  id: string;
  username: string;
  email: string | null;
  isSuperAdmin: boolean;
  memberships: Array<{ companyId: string; role: PlatformRole }>;
  storeIds: string[];
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      correlationId?: string;
    }
  }
}

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization ?? "";
  const [scheme, token] = authHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

export async function loadAuthUser(userId: string): Promise<AuthUser | null> {
  const db = getDb();
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = rows[0];
  if (!user || !user.isActive) return null;

  const memberships = await db
    .select({
      companyId: companyMemberships.companyId,
      role: companyMemberships.role,
    })
    .from(companyMemberships)
    .where(eq(companyMemberships.userId, user.id));

  const assignments = await db
    .select({ storeId: storeAssignments.storeId })
    .from(storeAssignments)
    .where(eq(storeAssignments.userId, user.id));

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    isSuperAdmin: user.isSuperAdmin,
    memberships: memberships.map((m) => ({
      companyId: m.companyId,
      role: m.role as PlatformRole,
    })),
    storeIds: assignments.map((a) => a.storeId),
  };
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return fail(res, 401, "Unauthorized", "UNAUTHORIZED");
    }
    const payload = verifyJwt(token);
    if (!payload?.sub) {
      return fail(res, 401, "Invalid or expired token", "UNAUTHORIZED");
    }
    const user = await loadAuthUser(String(payload.sub));
    if (!user) {
      return fail(res, 401, "User not found or inactive", "UNAUTHORIZED");
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/** Optional auth — sets req.user when token present, otherwise continues. */
export async function optionalAuthenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = getBearerToken(req);
    if (!token) return next();
    const payload = verifyJwt(token);
    if (!payload?.sub) return next();
    req.user = (await loadAuthUser(String(payload.sub))) ?? undefined;
    next();
  } catch {
    next();
  }
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.isSuperAdmin) {
    return fail(res, 403, "SuperAdmin required", "FORBIDDEN");
  }
  next();
}

const ROLE_RANK: Record<PlatformRole, number> = {
  SuperAdmin: 100,
  CompanyAdmin: 80,
  StoreManager: 60,
  Operator: 40,
  Viewer: 20,
};

export function roleAtLeast(role: PlatformRole, minimum: PlatformRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export function getMembership(user: AuthUser, companyId: string) {
  return user.memberships.find((m) => m.companyId === companyId);
}

export function canAccessCompany(user: AuthUser, companyId: string): boolean {
  if (user.isSuperAdmin) return true;
  return !!getMembership(user, companyId);
}

export function requireCompanyAccess(paramName = "id") {
  return (req: Request, res: Response, next: NextFunction) => {
    const companyId = req.params[paramName] || req.body?.companyId || req.query.companyId;
    if (!companyId || typeof companyId !== "string") {
      return fail(res, 400, "companyId is required", "BAD_REQUEST");
    }
    if (!req.user || !canAccessCompany(req.user, companyId)) {
      return fail(res, 403, "No access to this company", "FORBIDDEN");
    }
    next();
  };
}

export function requireCompanyRole(minimum: PlatformRole, companyIdResolver?: (req: Request) => string | undefined) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return fail(res, 401, "Unauthorized", "UNAUTHORIZED");
    if (req.user.isSuperAdmin) return next();

    const companyId =
      companyIdResolver?.(req) ||
      req.params.companyId ||
      req.params.id ||
      req.body?.companyId;

    if (!companyId) {
      return fail(res, 400, "companyId is required", "BAD_REQUEST");
    }

    const membership = getMembership(req.user, companyId);
    if (!membership || !roleAtLeast(membership.role, minimum)) {
      return fail(res, 403, "Insufficient role for this company", "FORBIDDEN");
    }
    next();
  };
}

export function accessibleCompanyIds(user: AuthUser): string[] | "all" {
  if (user.isSuperAdmin) return "all";
  return user.memberships.map((m) => m.companyId);
}

export function assertStoreAccess(user: AuthUser, store: { id: string; companyId: string }) {
  if (user.isSuperAdmin) return;
  if (!canAccessCompany(user, store.companyId)) {
    throw new AppError(403, "No access to this store", "FORBIDDEN");
  }
  const membership = getMembership(user, store.companyId);
  if (!membership) throw new AppError(403, "No access to this store", "FORBIDDEN");
  if (membership.role === "StoreManager" || membership.role === "Operator" || membership.role === "Viewer") {
    if (user.storeIds.length > 0 && !user.storeIds.includes(store.id)) {
      throw new AppError(403, "Store not assigned to user", "FORBIDDEN");
    }
  }
}
