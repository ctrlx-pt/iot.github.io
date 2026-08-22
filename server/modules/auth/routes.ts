import { Router } from "express";
import { and, eq, gt, isNull } from "drizzle-orm";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import {
  getAccessTokenTtlSeconds,
  getRefreshTokenTtlSeconds,
  REFRESH_COOKIE_NAME,
} from "../../config/env";
import { getDb } from "../../db/client";
import { refreshTokens, users } from "../../db/schema";
import { authenticate, loadAuthUser } from "../../middleware/auth";
import { asyncHandler, fail, ok } from "../../middleware/errors";
import {
  generateRefreshTokenRaw,
  hashToken,
  signJwt,
} from "../../services/crypto/jwt";
import { hashPassword, verifyPassword } from "../../services/crypto/password";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, data: null, errors: [{ code: "RATE_LIMIT", message: "Too many requests" }] },
});

function setRefreshCookie(res: any, rawToken: string, maxAgeSeconds: number) {
  const isProd = process.env.NODE_ENV === "production";
  res.cookie(REFRESH_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    maxAge: maxAgeSeconds * 1000,
    path: "/api/auth",
  });
}

function clearRefreshCookie(res: any) {
  res.clearCookie(REFRESH_COOKIE_NAME, { path: "/api/auth" });
}

async function issueTokens(userId: string, res: any) {
  const accessToken = signJwt({ sub: userId, typ: "access" }, getAccessTokenTtlSeconds());
  const rawRefresh = generateRefreshTokenRaw();
  const tokenHash = hashToken(rawRefresh);
  const ttl = getRefreshTokenTtlSeconds();
  const expiresAt = new Date(Date.now() + ttl * 1000);

  const db = getDb();
  await db.insert(refreshTokens).values({
    userId,
    tokenHash,
    expiresAt,
  });

  setRefreshCookie(res, rawRefresh, ttl);
  return { accessToken, expiresIn: getAccessTokenTtlSeconds() };
}

export function createAuthRouter(): Router {
  const router = Router();

  router.post(
    "/login",
    authLimiter,
    asyncHandler(async (req, res) => {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 422, "Validation failed", "VALIDATION_ERROR", parsed.error.issues);
      }

      const { username, password } = parsed.data;
      const db = getDb();
      const rows = await db.select().from(users).where(eq(users.username, username)).limit(1);
      const user = rows[0];

      if (!user || !verifyPassword(password, user.passwordHash)) {
        return fail(res, 401, "Invalid credentials", "INVALID_CREDENTIALS");
      }
      if (!user.isActive) {
        return fail(res, 403, "Account is disabled", "FORBIDDEN");
      }

      const tokens = await issueTokens(user.id, res);
      const authUser = await loadAuthUser(user.id);

      return ok(res, {
        token: tokens.accessToken,
        accessToken: tokens.accessToken,
        expiresIn: tokens.expiresIn,
        user: authUser,
      });
    }),
  );

  router.post(
    "/refresh",
    authLimiter,
    asyncHandler(async (req, res) => {
      const raw =
        req.cookies?.[REFRESH_COOKIE_NAME] ||
        (typeof req.body?.refreshToken === "string" ? req.body.refreshToken : null);

      if (!raw) {
        return fail(res, 401, "Refresh token missing", "UNAUTHORIZED");
      }

      const tokenHash = hashToken(raw);
      const db = getDb();
      const now = new Date();
      const rows = await db
        .select()
        .from(refreshTokens)
        .where(
          and(
            eq(refreshTokens.tokenHash, tokenHash),
            isNull(refreshTokens.revokedAt),
            gt(refreshTokens.expiresAt, now),
          ),
        )
        .limit(1);

      const existing = rows[0];
      if (!existing) {
        clearRefreshCookie(res);
        return fail(res, 401, "Invalid refresh token", "UNAUTHORIZED");
      }

      // Rotate
      await db
        .update(refreshTokens)
        .set({ revokedAt: now })
        .where(eq(refreshTokens.id, existing.id));

      const tokens = await issueTokens(existing.userId, res);
      return ok(res, {
        token: tokens.accessToken,
        accessToken: tokens.accessToken,
        expiresIn: tokens.expiresIn,
      });
    }),
  );

  router.post(
    "/logout",
    asyncHandler(async (req, res) => {
      const raw = req.cookies?.[REFRESH_COOKIE_NAME];
      if (raw) {
        const db = getDb();
        await db
          .update(refreshTokens)
          .set({ revokedAt: new Date() })
          .where(eq(refreshTokens.tokenHash, hashToken(raw)));
      }
      clearRefreshCookie(res);
      return ok(res, { loggedOut: true });
    }),
  );

  router.get(
    "/me",
    authenticate,
    asyncHandler(async (req, res) => {
      return ok(res, { user: req.user });
    }),
  );

  // Dev helper: register disabled in production unless ALLOW_REGISTER=true
  router.post(
    "/register",
    authLimiter,
    asyncHandler(async (req, res) => {
      if (process.env.NODE_ENV === "production" && process.env.ALLOW_REGISTER !== "true") {
        return fail(res, 403, "Registration disabled", "FORBIDDEN");
      }
      const schema = z.object({
        username: z.string().min(3),
        password: z.string().min(6),
        email: z.string().email().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return fail(res, 422, "Validation failed", "VALIDATION_ERROR", parsed.error.issues);
      }
      const db = getDb();
      const existing = await db
        .select()
        .from(users)
        .where(eq(users.username, parsed.data.username))
        .limit(1);
      if (existing.length) {
        return fail(res, 409, "Username already taken", "CONFLICT");
      }
      const inserted = await db
        .insert(users)
        .values({
          username: parsed.data.username,
          email: parsed.data.email,
          passwordHash: hashPassword(parsed.data.password),
          emailVerified: true,
        })
        .returning();
      const user = inserted[0];
      const tokens = await issueTokens(user.id, res);
      return ok(
        res,
        {
          token: tokens.accessToken,
          accessToken: tokens.accessToken,
          expiresIn: tokens.expiresIn,
          user: await loadAuthUser(user.id),
        },
        201,
      );
    }),
  );

  return router;
}
