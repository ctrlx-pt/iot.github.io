import type { Express, Request, Response } from "express";
import { storage } from "./storage";
import {
  insertCompanySchema,
  insertLocationSchema,
  insertLightSchema,
  updateLightSchema,
  insertTvSchema,
  updateTvSchema,
  insertVideoSchema,
  insertOrganizationSchema,
  createInviteSchema,
  type Light,
  type Tv,
} from "@shared/schema";
import { ZodError } from "zod";
import crypto, { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { getDb } from "./db/client";
import { users, organizations, userOrganizations, organizationInvites, verificationCodes, userStorePermissions, legacyCompanies } from "./db/schema";
import { eq, and, gt } from "drizzle-orm";
import { generateVerificationCode, sendVerificationCodeEmail } from "./email";
import { getJwtSecret } from "./config/env";

export type BroadcastDeviceUpdate = (
  type: "light_update" | "tv_update",
  deviceId: string,
  data: Light | Tv,
) => void;

const noopBroadcast: BroadcastDeviceUpdate = () => {};

export async function registerRoutes(
  app: Express,
  opts?: { broadcastDeviceUpdate?: BroadcastDeviceUpdate },
): Promise<void> {
  const broadcastDeviceUpdate = opts?.broadcastDeviceUpdate ?? noopBroadcast;

  // --- Auth helpers (JWT, simple credential check) ---
  const jwtSecret = getJwtSecret();
  const defaultAuthUsername = process.env.AUTH_USERNAME ?? "admin";
  const defaultAuthPassword = process.env.AUTH_PASSWORD ?? "changeme";
  const defaultAuthEmail = process.env.AUTH_EMAIL ?? "admin@localhost";

  function base64url(input: any) {
    return input
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  }

  function signJwt(payload: Record<string, any>, expiresInSeconds = 60 * 60 * 24) {
    const header = { alg: "HS256", typ: "JWT" };
    const now = Math.floor(Date.now() / 1000);
    const body = { ...payload, iat: now, exp: now + expiresInSeconds };
    const headerB64 = base64url(Buffer.from(JSON.stringify(header)));
    const payloadB64 = base64url(Buffer.from(JSON.stringify(body)));
    const data = `${headerB64}.${payloadB64}`;
    const signature = base64url(
      crypto.createHmac("sha256", jwtSecret).update(data).digest(),
    );
    return `${data}.${signature}`;
  }

  function verifyJwt(token: string): Record<string, any> | null {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, signature] = parts;
    const data = `${headerB64}.${payloadB64}`;
    const expectedSig = base64url(
      crypto.createHmac("sha256", jwtSecret).update(data).digest(),
    );
    if (expectedSig !== signature) return null;
    try {
      const payload = JSON.parse(Buffer.from(payloadB64, "base64").toString("utf8"));
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) return null;
      return payload;
    } catch {
      return null;
    }
  }

  function getBearerToken(req: any) {
    const authHeader = req.headers?.authorization ?? "";
    const [scheme, token] = authHeader.split(" ");
    if (scheme?.toLowerCase() !== "bearer" || !token) return null;
    return token;
  }

  // --- User storage helpers (DB-backed auth) ---
  function hashPassword(password: string) {
    const salt = randomBytes(16).toString("hex");
    const derived = scryptSync(password, salt, 64).toString("hex");
    return `${salt}:${derived}`;
  }

  function verifyPassword(password: string, stored: string) {
    const [salt, hashed] = stored.split(":");
    if (!salt || !hashed) return false;
    const derived = scryptSync(password, salt, 64).toString("hex");
    return timingSafeEqual(Buffer.from(hashed, "hex"), Buffer.from(derived, "hex"));
  }

  async function findUser(username: string) {
    const db = await getDb();
    const rows = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return rows[0];
  }

  async function ensureDefaultUser() {
    const db = await getDb();
    const existing = await db.select().from(users).where(eq(users.username, defaultAuthUsername)).limit(1);
    if (existing.length > 0) return;
    const passwordHash = hashPassword(defaultAuthPassword);
    await db.insert(users).values({ 
      username: defaultAuthUsername, 
      email: defaultAuthEmail,
      passwordHash,
      emailVerified: true,
      isSuperAdmin: true,
    });
  }

  await ensureDefaultUser();

  // --- Home Assistant proxy helpers ---
  let haBaseUrl = (process.env.HA_BASE_URL ?? "").trim().replace(/\/+$/, "");
  // Allow setting HA_BASE_URL as just a hostname (e.g. "ctrlxprod.diogomendes.me").
  // Node fetch requires an absolute URL with scheme, otherwise it is treated as a relative path.
  if (haBaseUrl && !/^https?:\/\//i.test(haBaseUrl)) {
    haBaseUrl = `https://${haBaseUrl}`;
  }
  const haToken = process.env.HA_TOKEN ?? "";

  async function haRequest(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ status: number; json: any }> {
    // Log configuration
    console.log("[HA Proxy] Config check:", {
      haBaseUrl: haBaseUrl || "(not set)",
      haTokenSet: haToken ? `${haToken.substring(0, 10)}...` : "(not set)",
      haTokenLength: haToken?.length || 0,
    });

    if (!haBaseUrl || !haToken) {
      console.error("[HA Proxy] ERROR: Missing configuration", {
        haBaseUrl: !!haBaseUrl,
        haToken: !!haToken,
      });
      return { status: 500, json: { error: "HA_BASE_URL or HA_TOKEN not configured" } };
    }

    const url = `${haBaseUrl}${path}`;
    console.log("[HA Proxy] Request:", {
      method,
      url,
      hasBody: !!body,
    });

    try {
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${haToken}`,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      const text = await res.text();
      let json: any = text;
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        json = { message: text };
      }

      console.log("[HA Proxy] Response:", {
        status: res.status,
        ok: res.ok,
        responseLength: text.length,
        jsonPreview: typeof json === "object" ? JSON.stringify(json).substring(0, 200) : json,
      });

      return { status: res.status, json };
    } catch (err: any) {
      console.error("[HA Proxy] Fetch error:", {
        message: err?.message,
        cause: err?.cause,
      });
      return { status: 500, json: { error: `HA request failed: ${err?.message}` } };
    }
  }

  // --- Auth routes with 2FA ---
  
  // Helper to create and send verification code
  async function createAndSendVerificationCode(
    userId: string,
    email: string,
    type: "email_verify" | "login_2fa" | "password_reset"
  ): Promise<boolean> {
    const db = await getDb();
    const code = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    
    await db.insert(verificationCodes).values({
      userId,
      code,
      type,
      expiresAt,
    });
    
    const emailType = type === "email_verify" ? "register" : type === "password_reset" ? "password_reset" : "login";
    return sendVerificationCodeEmail(email, code, emailType);
  }
  
  // Helper to verify code
  async function verifyCode(
    userId: string,
    code: string,
    type: "email_verify" | "login_2fa" | "password_reset"
  ): Promise<boolean> {
    const db = await getDb();
    const now = new Date();
    
    const [validCode] = await db
      .select()
      .from(verificationCodes)
      .where(
        and(
          eq(verificationCodes.userId, userId),
          eq(verificationCodes.code, code),
          eq(verificationCodes.type, type),
          gt(verificationCodes.expiresAt, now)
        )
      )
      .limit(1);
    
    if (!validCode || validCode.usedAt) {
      return false;
    }
    
    // Mark code as used
    await db
      .update(verificationCodes)
      .set({ usedAt: now })
      .where(eq(verificationCodes.id, validCode.id));
    
    return true;
  }

  // Step 1: Login - verify credentials and send 2FA code
  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body || {};
    const user = username ? await findUser(username) : null;
    if (!user || !verifyPassword(password ?? "", user.passwordHash)) {
      return res.status(401).json({ error: "Credenciais inválidas" });
    }

    const userEmail = typeof user.email === "string" && user.email.trim() !== ""
      ? user.email
      : null;

    // If user has no email, skip 2FA and login directly (email is optional)
    if (!userEmail) {
      const token = signJwt({ sub: user.username });
      return res.json({ token, user: { username: user.username, email: user.email } });
    }

    // Check if email is verified (only if user has email)
    if (!user.emailVerified) {
      return res.status(403).json({ 
        error: "Email não verificado",
        requiresEmailVerification: true,
        userId: user.id 
      });
    }

    // Send 2FA code
    const sent = await createAndSendVerificationCode(user.id, userEmail, "login_2fa");
    if (!sent) {
      return res.status(500).json({ error: "Falha ao enviar código de verificação" });
    }

    // Return pending state - user must verify 2FA
    res.json({ 
      requires2FA: true,
      userId: user.id,
      email: userEmail.replace(/(.{2})(.*)(@.*)/, "$1***$3"), // Mask email
      message: "Código de verificação enviado para o seu email"
    });
  });

  // Step 2: Verify 2FA code and complete login
  app.post("/api/auth/verify-2fa", async (req, res) => {
    const { userId, code } = req.body || {};
    if (!userId || !code) {
      return res.status(400).json({ error: "userId e código são obrigatórios" });
    }
    
    const db = await getDb();
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) {
      return res.status(404).json({ error: "Utilizador não encontrado" });
    }
    
    const valid = await verifyCode(userId, code, "login_2fa");
    if (!valid) {
      return res.status(401).json({ error: "Código inválido ou expirado" });
    }
    
    const token = signJwt({ sub: user.username });
    res.json({ token, user: { username: user.username, email: user.email } });
  });

  // Register - Step 1: Create account and send verification email
  app.post("/api/auth/register", async (req, res) => {
    const { username, email, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: "username e password são obrigatórios" });
    }

    const normalizedEmail =
      typeof email === "string" && email.trim() !== ""
        ? email.trim().toLowerCase()
        : null;

    // Validate email format (if provided)
    if (normalizedEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(normalizedEmail)) {
        return res.status(400).json({ error: "Email inválido" });
      }
    }
    
    const db = await getDb();
    
    // Check if username exists
    const existingUsername = await findUser(username);
    if (existingUsername) {
      return res.status(409).json({ error: "Nome de utilizador já existe" });
    }
    
    // Check if email exists
    if (normalizedEmail) {
      const [existingEmail] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
      if (existingEmail) {
        return res.status(409).json({ error: "Email já registado" });
      }
    }
    
    const passwordHash = hashPassword(password);
    const [newUser] = await db.insert(users).values({ 
      username, 
      email: normalizedEmail || null,
      passwordHash,
      emailVerified: normalizedEmail ? false : true 
    }).returning();

    if (normalizedEmail) {
      // Send verification email
      const sent = await createAndSendVerificationCode(newUser.id, normalizedEmail, "email_verify");
      if (!sent) {
        // Delete the user if email failed
        await db.delete(users).where(eq(users.id, newUser.id));
        return res.status(500).json({ error: "Falha ao enviar email de verificação" });
      }

      return res.status(201).json({ 
        requiresEmailVerification: true,
        userId: newUser.id,
        email: normalizedEmail.replace(/(.{2})(.*)(@.*)/, "$1***$3"),
        message: "Conta criada! Verifique o seu email para ativar a conta."
      });
    }

    const token = signJwt({ sub: newUser.username });
    res.status(201).json({ token, user: { username: newUser.username, email: newUser.email } });
  });

  // Register - Step 2: Verify email
  app.post("/api/auth/verify-email", async (req, res) => {
    const { userId, code } = req.body || {};
    if (!userId || !code) {
      return res.status(400).json({ error: "userId e código são obrigatórios" });
    }
    
    const db = await getDb();
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) {
      return res.status(404).json({ error: "Utilizador não encontrado" });
    }

    if (!user.email) {
      return res.status(400).json({ error: "Utilizador não tem email associado" });
    }
    
    if (user.emailVerified) {
      return res.status(400).json({ error: "Email já verificado" });
    }
    
    const valid = await verifyCode(userId, code, "email_verify");
    if (!valid) {
      return res.status(401).json({ error: "Código inválido ou expirado" });
    }
    
    // Mark email as verified
    await db.update(users).set({ emailVerified: true }).where(eq(users.id, userId));
    
    const token = signJwt({ sub: user.username });
    res.json({ 
      token, 
      user: { username: user.username, email: user.email },
      message: "Email verificado com sucesso!"
    });
  });

  // Resend verification code
  app.post("/api/auth/resend-code", async (req, res) => {
    const { userId, type } = req.body || {};
    if (!userId || !type) {
      return res.status(400).json({ error: "userId e type são obrigatórios" });
    }
    
    const db = await getDb();
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) {
      return res.status(404).json({ error: "Utilizador não encontrado" });
    }

    if (!user.email) {
      return res.status(400).json({ error: "Utilizador não tem email associado" });
    }
    
    const codeType = type === "register" ? "email_verify" : "login_2fa";
    const sent = await createAndSendVerificationCode(user.id, user.email, codeType);
    if (!sent) {
      return res.status(500).json({ error: "Falha ao enviar código" });
    }
    
    res.json({ message: "Novo código enviado" });
  });

  // Password Reset - Step 1: Request reset code
  app.post("/api/auth/forgot-password", async (req, res) => {
    const { email } = req.body || {};
    if (!email) {
      return res.status(400).json({ error: "Email é obrigatório" });
    }
    
    const normalizedEmail = email.toLowerCase().trim();
    const db = await getDb();
    const [user] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
    
    // Always return success to prevent email enumeration attacks
    if (!user) {
      return res.json({ 
        message: "Se o email existir, receberá um código de recuperação"
      });
    }

    if (!user.email) {
      return res.json({ 
        message: "Se o email existir, receberá um código de recuperação"
      });
    }
    
    const sent = await createAndSendVerificationCode(user.id, user.email, "password_reset");
    if (!sent) {
      return res.status(500).json({ error: "Falha ao enviar email de recuperação" });
    }
    
    res.json({ 
      success: true,
      userId: user.id,
      email: user.email.replace(/(.{2})(.*)(@.*)/, "$1***$3"),
      message: "Código de recuperação enviado para o seu email"
    });
  });

  // Password Reset - Step 2: Verify code and set new password
  app.post("/api/auth/reset-password", async (req, res) => {
    const { userId, code, newPassword } = req.body || {};
    if (!userId || !code || !newPassword) {
      return res.status(400).json({ error: "userId, código e nova password são obrigatórios" });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ error: "A password deve ter pelo menos 6 caracteres" });
    }
    
    const db = await getDb();
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) {
      return res.status(404).json({ error: "Utilizador não encontrado" });
    }
    
    const valid = await verifyCode(userId, code, "password_reset");
    if (!valid) {
      return res.status(401).json({ error: "Código inválido ou expirado" });
    }
    
    // Update password
    const newPasswordHash = hashPassword(newPassword);
    await db.update(users).set({ passwordHash: newPasswordHash }).where(eq(users.id, userId));
    
    res.json({ 
      success: true,
      message: "Password alterada com sucesso! Pode agora iniciar sessão."
    });
  });

  // Resend password reset code
  app.post("/api/auth/resend-reset-code", async (req, res) => {
    const { userId } = req.body || {};
    if (!userId) {
      return res.status(400).json({ error: "userId é obrigatório" });
    }
    
    const db = await getDb();
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) {
      return res.status(404).json({ error: "Utilizador não encontrado" });
    }

    if (!user.email) {
      return res.status(400).json({ error: "Utilizador não tem email associado" });
    }
    
    const sent = await createAndSendVerificationCode(user.id, user.email, "password_reset");
    if (!sent) {
      return res.status(500).json({ error: "Falha ao enviar código" });
    }
    
    res.json({ message: "Novo código enviado" });
  });

  app.get("/api/auth/me", async (req, res) => {
    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const payload = verifyJwt(token);
    if (!payload) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
    
    // Get full user info including organizations
    const db = await getDb();
    const user = await findUser(payload.sub);
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }
    
    // Get user's organizations
    const memberships = await db.select().from(userOrganizations).where(eq(userOrganizations.userId, user.id));
    const hasOrganizations = memberships.length > 0;
    
    res.json({ 
      user: { 
        id: user.id,
        username: user.username, 
        email: user.email,
        hasOrganizations 
      } 
    });
  });

  // Update profile
  app.patch("/api/auth/profile", async (req, res) => {
    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const payload = verifyJwt(token);
    if (!payload) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
    
    const db = await getDb();
    const user = await findUser(payload.sub);
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }
    
    const { username, email } = req.body || {};
    const normalizedEmail =
      typeof email === "string" ? email.trim().toLowerCase() : undefined;
    const shouldClearEmail = normalizedEmail === "";
    
    // Validate
    if (username && username !== user.username) {
      const existing = await findUser(username);
      if (existing) {
        return res.status(409).json({ error: "Nome de utilizador já existe" });
      }
    }
    
    if (normalizedEmail && normalizedEmail !== user.email) {
      const [existingEmail] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
      if (existingEmail) {
        return res.status(409).json({ error: "Email já registado" });
      }
    }
    
    // Update
    const updates: any = {};
    if (username) updates.username = username;
    if (shouldClearEmail) {
      updates.email = null;
    } else if (normalizedEmail) {
      updates.email = normalizedEmail;
    }
    
    if (Object.keys(updates).length > 0) {
      await db.update(users).set(updates).where(eq(users.id, user.id));
    }
    
    res.json({ success: true });
  });

  // Change password
  app.post("/api/auth/change-password", async (req, res) => {
    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const payload = verifyJwt(token);
    if (!payload) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
    
    const db = await getDb();
    const user = await findUser(payload.sub);
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }
    
    const { currentPassword, newPassword } = req.body || {};
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Palavra-passe atual e nova são obrigatórias" });
    }
    
    // Verify current password
    if (!verifyPassword(currentPassword, user.passwordHash)) {
      return res.status(401).json({ error: "Palavra-passe atual incorreta" });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ error: "A nova palavra-passe deve ter pelo menos 6 caracteres" });
    }
    
    // Update password
    const newHash = hashPassword(newPassword);
    await db.update(users).set({ passwordHash: newHash }).where(eq(users.id, user.id));
    
    res.json({ success: true });
  });

  // Protect all other /api routes
  app.use("/api", (req: any, res: any, next: any) => {
    // Allow auth routes without authentication
    if (req.path.startsWith("/auth")) {
      return next();
    }
    // Allow Home Assistant routes without user authentication
    // (they use HA token configured on server)
    if (req.path.startsWith("/ha") || req.path.startsWith("/states") || req.path.startsWith("/services") || req.path.startsWith("/websocket")) {
      return next();
    }
    // Allow HA static asset routes
    if (req.path.startsWith("/ha/static/")) {
      return next();
    }
    const token = getBearerToken(req);
    const payload = token ? verifyJwt(token) : null;
    if (!payload) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    (req as any).user = payload;
    next();
  });

  // --- Organization routes ---
  
  // Get user's organizations
  app.get("/api/organizations", async (req: any, res) => {
    try {
      const db = await getDb();
      const user = await findUser(req.user?.sub);
      if (!user) return res.status(401).json({ error: "User not found" });
      
      const memberships = await db.select().from(userOrganizations).where(eq(userOrganizations.userId, user.id));
      const orgIds = memberships.map((m: any) => m.organizationId);
      
      if (orgIds.length === 0) return res.json([]);
      
      const orgs = await Promise.all(
        orgIds.map(async (orgId: string) => {
          const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
          const membership = memberships.find((m: any) => m.organizationId === orgId);
          return org ? { ...org, role: membership?.role } : null;
        })
      );
      
      res.json(orgs.filter(Boolean));
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch organizations" });
    }
  });

  // Create organization
  app.post("/api/organizations", async (req: any, res) => {
    try {
      const data = insertOrganizationSchema.parse(req.body);
      const db = await getDb();
      const user = await findUser(req.user?.sub);
      if (!user) return res.status(401).json({ error: "User not found" });
      
      const [org] = await db.insert(organizations).values({
        name: data.name,
        description: data.description,
      }).returning();
      
      // Add creator as owner
      await db.insert(userOrganizations).values({
        userId: user.id,
        organizationId: org.id,
        role: "owner",
      });
      
      res.status(201).json({ ...org, role: "owner" });
    } catch (error: any) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: "Invalid organization data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create organization" });
    }
  });

  // Get single organization
  app.get("/api/organizations/:id", async (req: any, res) => {
    try {
      const db = await getDb();
      const user = await findUser(req.user?.sub);
      if (!user) return res.status(401).json({ error: "User not found" });
      
      const [membership] = await db.select().from(userOrganizations)
        .where(and(eq(userOrganizations.userId, user.id), eq(userOrganizations.organizationId, req.params.id)));
      
      if (!membership) return res.status(403).json({ error: "Not a member of this organization" });
      
      const [org] = await db.select().from(organizations).where(eq(organizations.id, req.params.id));
      if (!org) return res.status(404).json({ error: "Organization not found" });
      
      res.json({ ...org, role: membership.role });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch organization" });
    }
  });

  // Get organization members
  app.get("/api/organizations/:id/members", async (req: any, res) => {
    try {
      const db = await getDb();
      const user = await findUser(req.user?.sub);
      if (!user) return res.status(401).json({ error: "User not found" });
      
      const [membership] = await db.select().from(userOrganizations)
        .where(and(eq(userOrganizations.userId, user.id), eq(userOrganizations.organizationId, req.params.id)));
      
      if (!membership) return res.status(403).json({ error: "Not a member of this organization" });
      
      const members = await db.select().from(userOrganizations).where(eq(userOrganizations.organizationId, req.params.id));
      
      const memberDetails = await Promise.all(
        members.map(async (m: any) => {
          const [u] = await db.select().from(users).where(eq(users.id, m.userId));
          
          // Get store permissions for this user
          const permissions = await db.select({
            companyId: userStorePermissions.companyId,
            companyName: legacyCompanies.name,
            canView: userStorePermissions.canView,
            canEdit: userStorePermissions.canEdit,
          })
            .from(userStorePermissions)
            .innerJoin(legacyCompanies, eq(userStorePermissions.companyId, legacyCompanies.id))
            .where(eq(userStorePermissions.userId, m.userId));
          
          return { 
            id: m.id, 
            oderId: m.userId, 
            username: u?.username, 
            email: u?.email,
            role: m.role, 
            invitedAt: m.invitedAt,
            storePermissions: permissions,
          };
        })
      );
      
      res.json(memberDetails);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch members" });
    }
  });

  // Update member role
  app.patch("/api/organizations/:id/members/:memberId", async (req: any, res) => {
    try {
      const db = await getDb();
      const user = await findUser(req.user?.sub);
      if (!user) return res.status(401).json({ error: "User not found" });
      
      // Check if requester is owner
      const [membership] = await db.select().from(userOrganizations)
        .where(and(eq(userOrganizations.userId, user.id), eq(userOrganizations.organizationId, req.params.id)));
      
      if (!membership || membership.role !== "owner") {
        return res.status(403).json({ error: "Only owners can change member roles" });
      }
      
      // Get target member
      const [targetMember] = await db.select().from(userOrganizations)
        .where(eq(userOrganizations.id, req.params.memberId));
      
      if (!targetMember) {
        return res.status(404).json({ error: "Member not found" });
      }
      
      // Can't change owner role
      if (targetMember.role === "owner") {
        return res.status(403).json({ error: "Cannot change owner role" });
      }
      
      const { role } = req.body || {};
      if (!role || !["admin", "member"].includes(role)) {
        return res.status(400).json({ error: "Invalid role" });
      }
      
      await db.update(userOrganizations)
        .set({ role })
        .where(eq(userOrganizations.id, req.params.memberId));
      
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to update member role" });
    }
  });

  // Remove member from organization
  app.delete("/api/organizations/:id/members/:memberId", async (req: any, res) => {
    try {
      const db = await getDb();
      const user = await findUser(req.user?.sub);
      if (!user) return res.status(401).json({ error: "User not found" });
      
      // Check if requester is owner
      const [membership] = await db.select().from(userOrganizations)
        .where(and(eq(userOrganizations.userId, user.id), eq(userOrganizations.organizationId, req.params.id)));
      
      if (!membership || membership.role !== "owner") {
        return res.status(403).json({ error: "Only owners can remove members" });
      }
      
      // Get target member
      const [targetMember] = await db.select().from(userOrganizations)
        .where(eq(userOrganizations.id, req.params.memberId));
      
      if (!targetMember) {
        return res.status(404).json({ error: "Member not found" });
      }
      
      // Can't remove owner
      if (targetMember.role === "owner") {
        return res.status(403).json({ error: "Cannot remove organization owner" });
      }
      
      await db.delete(userOrganizations)
        .where(eq(userOrganizations.id, req.params.memberId));
      
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to remove member" });
    }
  });

  // Create invite
  app.post("/api/organizations/:id/invites", async (req: any, res) => {
    try {
      const db = await getDb();
      const user = await findUser(req.user?.sub);
      if (!user) return res.status(401).json({ error: "User not found" });
      
      const [membership] = await db.select().from(userOrganizations)
        .where(and(eq(userOrganizations.userId, user.id), eq(userOrganizations.organizationId, req.params.id)));
      
      if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
        return res.status(403).json({ error: "Only owners and admins can create invites" });
      }
      
      const { role = "member", invitedEmail } = req.body || {};
      const inviteCode = randomBytes(16).toString("hex");
      
      const [invite] = await db.insert(organizationInvites).values({
        organizationId: req.params.id,
        invitedByUserId: user.id,
        invitedEmail: invitedEmail || null,
        inviteCode,
        role,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      }).returning();
      
      res.status(201).json(invite);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to create invite" });
    }
  });

  // Get organization invites
  app.get("/api/organizations/:id/invites", async (req: any, res) => {
    try {
      const db = await getDb();
      const user = await findUser(req.user?.sub);
      if (!user) return res.status(401).json({ error: "User not found" });
      
      const [membership] = await db.select().from(userOrganizations)
        .where(and(eq(userOrganizations.userId, user.id), eq(userOrganizations.organizationId, req.params.id)));
      
      if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
        return res.status(403).json({ error: "Only owners and admins can view invites" });
      }
      
      const invites = await db.select().from(organizationInvites)
        .where(eq(organizationInvites.organizationId, req.params.id));
      
      res.json(invites);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch invites" });
    }
  });

  // Delete invite
  app.delete("/api/organizations/:id/invites/:inviteId", async (req: any, res) => {
    try {
      const db = await getDb();
      const user = await findUser(req.user?.sub);
      if (!user) return res.status(401).json({ error: "User not found" });
      
      const [membership] = await db.select().from(userOrganizations)
        .where(and(eq(userOrganizations.userId, user.id), eq(userOrganizations.organizationId, req.params.id)));
      
      if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
        return res.status(403).json({ error: "Only owners and admins can delete invites" });
      }
      
      await db.delete(organizationInvites)
        .where(eq(organizationInvites.id, req.params.inviteId));
      
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to delete invite" });
    }
  });

  // Create user directly (admin only) - creates user and adds to organization with store permissions
  app.post("/api/organizations/:id/users", async (req: any, res) => {
    try {
      const db = await getDb();
      const adminUser = await findUser(req.user?.sub);
      if (!adminUser) return res.status(401).json({ error: "User not found" });
      
      // Check if admin/owner
      const [membership] = await db.select().from(userOrganizations)
        .where(and(eq(userOrganizations.userId, adminUser.id), eq(userOrganizations.organizationId, req.params.id)));
      
      if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
        return res.status(403).json({ error: "Apenas proprietários e administradores podem criar utilizadores" });
      }
      
      const { username, email, password, role = "member", storePermissions = [] } = req.body || {};
      
      if (!username || !password) {
        return res.status(400).json({ error: "Username e password são obrigatórios" });
      }

      const normalizedEmail =
        typeof email === "string" && email.trim() !== ""
          ? email.trim().toLowerCase()
          : null;
      
      // Validate email
      if (normalizedEmail) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(normalizedEmail)) {
          return res.status(400).json({ error: "Email inválido" });
        }
      }
      
      // Check if username exists
      const existingUsername = await findUser(username);
      if (existingUsername) {
        return res.status(409).json({ error: "Nome de utilizador já existe" });
      }
      
      // Check if email exists
      if (normalizedEmail) {
        const [existingEmail] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
        if (existingEmail) {
          return res.status(409).json({ error: "Email já registado" });
        }
      }
      
      const passwordHash = hashPassword(password);
      
      // Create user (already verified since admin is creating)
      // Explicitly set email to null if not provided (not undefined)
      const [newUser] = await db.insert(users).values({
        username,
        email: normalizedEmail || null,
        passwordHash,
        emailVerified: true, // Admin-created users are auto-verified
      }).returning();
      
      // Add to organization
      await db.insert(userOrganizations).values({
        userId: newUser.id,
        organizationId: req.params.id,
        role,
      });
      
      // Add store permissions
      if (storePermissions && Array.isArray(storePermissions)) {
        for (const perm of storePermissions) {
          if (perm.companyId && (perm.canView || perm.canEdit)) {
            await db.insert(userStorePermissions).values({
              userId: newUser.id,
              companyId: perm.companyId,
              canView: perm.canView ?? true,
              canEdit: perm.canEdit ?? false,
            });
          }
        }
      }
      
      res.status(201).json({
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        role,
      });
    } catch (error: any) {
      console.error("Error creating user:", error);
      res.status(500).json({ error: "Falha ao criar utilizador" });
    }
  });

  // Get user's store permissions
  app.get("/api/organizations/:id/users/:userId/permissions", async (req: any, res) => {
    try {
      const db = await getDb();
      const adminUser = await findUser(req.user?.sub);
      if (!adminUser) return res.status(401).json({ error: "User not found" });
      
      // Check if admin/owner
      const [membership] = await db.select().from(userOrganizations)
        .where(and(eq(userOrganizations.userId, adminUser.id), eq(userOrganizations.organizationId, req.params.id)));
      
      if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
        return res.status(403).json({ error: "Sem permissão" });
      }
      
      const permissions = await db.select({
        id: userStorePermissions.id,
        companyId: userStorePermissions.companyId,
        companyName: legacyCompanies.name,
        canView: userStorePermissions.canView,
        canEdit: userStorePermissions.canEdit,
      })
        .from(userStorePermissions)
        .innerJoin(legacyCompanies, eq(userStorePermissions.companyId, legacyCompanies.id))
        .where(eq(userStorePermissions.userId, req.params.userId));
      
      res.json(permissions);
    } catch (error: any) {
      res.status(500).json({ error: "Falha ao obter permissões" });
    }
  });

  // Update user's store permissions
  app.put("/api/organizations/:id/users/:userId/permissions", async (req: any, res) => {
    try {
      const db = await getDb();
      const adminUser = await findUser(req.user?.sub);
      if (!adminUser) return res.status(401).json({ error: "User not found" });
      
      // Check if admin/owner
      const [membership] = await db.select().from(userOrganizations)
        .where(and(eq(userOrganizations.userId, adminUser.id), eq(userOrganizations.organizationId, req.params.id)));
      
      if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
        return res.status(403).json({ error: "Sem permissão" });
      }
      
      const { permissions = [] } = req.body || {};
      
      // Get all stores for this organization
      const orgStores = await db.select().from(legacyCompanies)
        .where(eq(legacyCompanies.organizationId, req.params.id));
      const orgStoreIds = new Set(orgStores.map(s => s.id));
      
      // Delete existing permissions for stores in this org
      for (const storeId of orgStoreIds) {
        await db.delete(userStorePermissions)
          .where(and(
            eq(userStorePermissions.userId, req.params.userId),
            eq(userStorePermissions.companyId, storeId)
          ));
      }
      
      // Add new permissions
      for (const perm of permissions) {
        if (perm.companyId && orgStoreIds.has(perm.companyId) && (perm.canView || perm.canEdit)) {
          await db.insert(userStorePermissions).values({
            userId: req.params.userId,
            companyId: perm.companyId,
            canView: perm.canView ?? true,
            canEdit: perm.canEdit ?? false,
          });
        }
      }
      
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: "Falha ao atualizar permissões" });
    }
  });

  // Accept invite (join organization)
  app.post("/api/invites/:code/accept", async (req: any, res) => {
    try {
      const db = await getDb();
      const user = await findUser(req.user?.sub);
      if (!user) return res.status(401).json({ error: "User not found" });
      
      const [invite] = await db.select().from(organizationInvites)
        .where(eq(organizationInvites.inviteCode, req.params.code));
      
      if (!invite) return res.status(404).json({ error: "Invite not found" });
      if (invite.usedAt) return res.status(400).json({ error: "Invite already used" });
      if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
        return res.status(400).json({ error: "Invite expired" });
      }
      
      // Check if already a member
      const [existing] = await db.select().from(userOrganizations)
        .where(and(eq(userOrganizations.userId, user.id), eq(userOrganizations.organizationId, invite.organizationId)));
      
      if (existing) return res.status(400).json({ error: "Already a member" });
      
      // Add user to organization
      await db.insert(userOrganizations).values({
        userId: user.id,
        organizationId: invite.organizationId,
        role: invite.role,
      });
      
      // Mark invite as used
      await db.update(organizationInvites)
        .set({ usedAt: new Date() })
        .where(eq(organizationInvites.id, invite.id));
      
      const [org] = await db.select().from(organizations).where(eq(organizations.id, invite.organizationId));
      
      res.json({ message: "Joined organization", organization: org });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to accept invite" });
    }
  });

  // --- Home Assistant proxy routes ---
  // Routes under /api/ha/ for explicit proxy calls
  app.get("/api/ha/states", async (_req, res) => {
    console.log("[HA Route] GET /api/ha/states called");
    const result = await haRequest("GET", "/api/states");
    console.log("[HA Route] GET /api/ha/states result:", result.status);
    return res.status(result.status).json(result.json);
  });

  app.get("/api/ha/states/:entityId", async (req, res) => {
    const { entityId } = req.params;
    console.log("[HA Route] GET /api/ha/states/:entityId called", { entityId });
    const result = await haRequest("GET", `/api/states/${encodeURIComponent(entityId)}`);
    console.log("[HA Route] GET /api/ha/states/:entityId result:", result.status);
    return res.status(result.status).json(result.json);
  });

  app.post("/api/ha/services/:domain/:service", async (req, res) => {
    const { domain, service } = req.params;
    console.log("[HA Route] POST /api/ha/services called", { domain, service, body: req.body });
    const result = await haRequest(
      "POST",
      `/api/services/${encodeURIComponent(domain)}/${encodeURIComponent(service)}`,
      req.body ?? {},
    );
    console.log("[HA Route] POST /api/ha/services result:", result.status);
    return res.status(result.status).json(result.json);
  });

  // Routes matching Home Assistant API structure for iframe dashboard
  // These allow the embedded HA frontend to make API calls through our proxy
  app.get("/api/states", async (_req, res) => {
    const result = await haRequest("GET", "/api/states");
    return res.status(result.status).json(result.json);
  });

  app.get("/api/states/:entityId", async (req, res) => {
    const { entityId } = req.params;
    const result = await haRequest("GET", `/api/states/${encodeURIComponent(entityId)}`);
    return res.status(result.status).json(result.json);
  });

  app.post("/api/services/:domain/:service", async (req, res) => {
    const { domain, service } = req.params;
    const result = await haRequest(
      "POST",
      `/api/services/${encodeURIComponent(domain)}/${encodeURIComponent(service)}`,
      req.body ?? {},
    );
    return res.status(result.status).json(result.json);
  });

  // WebSocket proxy for Home Assistant (if needed)
  // Note: WebSocket proxying is complex and may require a separate WebSocket server
  app.get("/api/websocket", async (_req, res) => {
    // WebSocket upgrade requests should be handled differently
    // For now, return an error suggesting direct connection
    res.status(426).json({ 
      error: "WebSocket connections should be made directly to Home Assistant",
      message: "The dashboard iframe will handle WebSocket connections with injected authentication"
    });
  });

  // Helper function to handle HA static asset proxying
  async function handleHaStaticProxy(req: Request, res: Response) {
    // Handle CORS preflight requests
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      return res.status(200).end();
    }

    // Extract the path after /api/ha/static
    // When using app.get("/api/ha/static/*", ...), Express captures * as req.params[0]
    const path = (req.params as any)[0] || "";
    const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
    
    // HARDCODED TEST: Redirect /local/pics/imagenobrand.png directly to HA
    if (path === "local/pics/imagenobrand.png" || path.startsWith("local/pics/imagenobrand.png")) {
      const directUrl = "https://ctrlxprod.diogomendes.me/local/pics/imagenobrand.png" + queryString;
      console.log("[HA Static] HARDCODED REDIRECT:", path, "->", directUrl);
      return res.redirect(302, directUrl);
    }
    
    console.log("[HA Static] Request received:", {
      method: req.method,
      path,
      originalUrl: req.originalUrl,
      url: req.url,
      hasBody: !!req.body,
    });
    
    if (!haBaseUrl || !haToken) {
      console.error("[HA Static] Configuration missing");
      return res.status(500).json({ error: "HA_BASE_URL or HA_TOKEN not configured" });
    }

    try {
      // Normalize path:
      // - strip leading slash
      // - fix double /static/ (static/static/ -> static/)
      // - remap community/hacs/local resources
      // - add /static/ prefix when missing for core asset roots
      let normalizedPath = path.startsWith('/') ? path.substring(1) : path;
      if (normalizedPath.startsWith('static/static/')) {
        normalizedPath = `static/${normalizedPath.substring('static/static/'.length)}`;
        console.log("[HA Static] Fixed double /static/ path:", path, "->", normalizedPath);
      }

      // Map Home Assistant community/hacs/local assets to the correct served path
      if (normalizedPath.startsWith('homeassistant/www/community/') || normalizedPath.startsWith('homeassistant/www/hacs/')) {
        const rest = normalizedPath.substring('homeassistant/www/'.length);
        normalizedPath = `hacsfiles/${rest}`;
        console.log("[HA Static] Mapped homeassistant/www/ asset:", path, "->", normalizedPath);
      } else if (normalizedPath.startsWith('local/')) {
        // Keep local/ paths as-is - these are user files in config/www/
        // NOT HACS resources, served directly by HA at /local/
        console.log("[HA Static] Keeping local/ path:", normalizedPath);
      } else if (normalizedPath.startsWith('hacsfiles/')) {
        // Already in correct format, just log it
        console.log("[HA Static] Path already in hacsfiles format:", normalizedPath);
      }

      // IMPORTANT: Home Assistant serves some assets under /static/* (fonts/translations/etc),
      // but others are served at the root (e.g. /frontend_latest/* and /hacsfiles/*).
      // We only add the /static/ prefix for paths that are known to live under /static/.
      const needsStaticPrefix =
        !normalizedPath.startsWith("static/") &&
        (normalizedPath.startsWith("fonts/") ||
          normalizedPath.startsWith("translations/") ||
          normalizedPath.startsWith("locale-data/"));

      if (needsStaticPrefix) normalizedPath = `static/${normalizedPath}`;
      const targetUrl = `${haBaseUrl}/${normalizedPath}${queryString}`;
      console.log("[HA Static] Proxying to HA:", {
        method: req.method,
        path,
        normalizedPath,
        targetUrl,
        hasBody: !!req.body,
      });
      
      // Prepare fetch options
      // Forward important headers from the original request
      const fetchOptions: RequestInit = {
        method: req.method,
        headers: {
          Authorization: `Bearer ${haToken}`,
          "User-Agent": req.headers['user-agent'] || "Mozilla/5.0",
          Accept: req.headers.accept || "*/*",
          "Accept-Language": req.headers['accept-language'] || "en-US,en;q=0.9",
          // Do NOT forward Accept-Encoding. Node's fetch will handle decoding; forwarding can
          // lead to encoded bodies being sent to the browser without proper headers.
          "Referer": req.headers.referer || haBaseUrl,
        },
      };

      // Forward request body for POST, PUT, PATCH, etc.
      if (req.body && (req.method === "POST" || req.method === "PUT" || req.method === "PATCH")) {
        const contentType = req.headers['content-type'] || 'application/json';
        fetchOptions.headers = {
          ...fetchOptions.headers,
          'Content-Type': contentType,
        };
        
        // If body is already a string/buffer, use it directly, otherwise stringify
        if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
          fetchOptions.body = req.body;
        } else {
          fetchOptions.body = JSON.stringify(req.body);
        }
      }

      const response = await fetch(targetUrl, fetchOptions);

      console.log("[HA Static] Response:", {
        method: req.method,
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get("content-type"),
        path,
        normalizedPath,
      });

      if (!response.ok) {
        // Try to get error body for debugging
        let errorBody = '';
        try {
          const text = await response.text();
          errorBody = text.substring(0, 200); // First 200 chars
        } catch (e) {
          // Ignore
        }
        
        console.warn("[HA Static] Failed:", {
          method: req.method,
          status: response.status,
          statusText: response.statusText,
          targetUrl,
          path,
        normalizedPath,
          errorBody: errorBody || '(no body)',
        });
        
        // Forward error status and headers
        response.headers.forEach((value, key) => {
          res.setHeader(key, value);
        });
        return res.status(response.status).end();
      }

      // Forward content type and other headers
      const contentType = response.headers.get("content-type");
      if (contentType) {
        res.setHeader("Content-Type", contentType);
      }
      
      const cacheControl = response.headers.get("cache-control");
      if (cacheControl) {
        res.setHeader("Cache-Control", cacheControl);
      }
      
      // Forward CORS headers to allow iframe access
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

      // Stream the response
      const buffer = await response.arrayBuffer();
      console.log("[HA Static] Successfully proxied:", {
        method: req.method,
        path,
        size: buffer.byteLength,
        contentType,
      });
      res.send(Buffer.from(buffer));
    } catch (err: any) {
      console.error("[HA Static] Error:", {
        method: req.method,
        path,
        error: err?.message,
      });
      res.status(500).end();
    }
  }

  // Service Worker route - serves the SW as a real file to ensure it works properly
  app.get("/ha-proxy-sw.js", (_req, res) => {
    const swCode = `
      // Force immediate activation - CRITICAL for intercepting dynamic imports
      self.addEventListener('install', function(event) {
        console.log('[HA Proxy SW] Installing...');
        // Skip waiting to activate immediately
        self.skipWaiting();
      });
      
      // Listen for skipWaiting messages from clients
      self.addEventListener('message', function(event) {
        console.log('[HA Proxy SW] Received message:', event.data);
        if (event.data && event.data.type === 'SKIP_WAITING') {
          console.log('[HA Proxy SW] Received SKIP_WAITING message, calling skipWaiting()');
          self.skipWaiting();
        }
      });
      
      self.addEventListener('activate', function(event) {
        console.log('[HA Proxy SW] Activating and claiming all clients...');
        event.waitUntil(
          Promise.all([
            self.clients.claim(),
            // Clear all caches to ensure fresh resources
            caches.keys().then(function(cacheNames) {
              return Promise.all(
                cacheNames.map(function(cacheName) {
                  console.log('[HA Proxy SW] Deleting cache:', cacheName);
                  return caches.delete(cacheName);
                })
              );
            })
          ]).then(function() {
            console.log('[HA Proxy SW] Activated and claimed all clients');
            // Notify all clients that SW is active
            return self.clients.matchAll().then(function(clients) {
              clients.forEach(function(client) {
                client.postMessage({ type: 'SW_ACTIVATED' });
              });
            });
          })
        );
      });
      
      // CRITICAL: Intercept ALL fetch requests, including dynamic ES6 imports
      self.addEventListener('fetch', function(event) {
        const requestUrl = event.request.url;
        const url = new URL(requestUrl);
        const currentOrigin = self.location.origin;
        
        // Only intercept requests to current origin (Netlify)
        if (url.origin !== currentOrigin) {
          // Different origin - let it through normally
          return;
        }
        
        const path = url.pathname;
        const method = event.request.method;
        const destination = event.request.destination;

        // Let /auth/* go through normally; our server handles these at the same origin.
        // (Routing /auth/* through /api/ha/static/* breaks /auth/token and can lead to 400s.)
        if (path.startsWith('/auth/')) {
          return;
        }
        
        // Skip if already proxied - let it through normally
        if (path.startsWith('/api/ha/static/')) {
          return;
        }
        
        // IMPORTANT: DO NOT skip /auth/*.
        // If we let /auth/* go through normally, Netlify/Express may redirect to the HA origin,
        // and that will get blocked by X-Frame-Options: SAMEORIGIN inside our iframe.
        // We treat /auth/* as something that MUST be proxied same-origin.
        
        // Skip API calls (not resources) - but ONLY if they're NOT resources
        // Some API endpoints might serve resources, so we need to be careful
        if (path.startsWith('/api/') && !path.startsWith('/api/ha/static/')) {
          // Check if it's actually a resource being served through an API endpoint
          const isResourceFile = /\\.(js|mjs|css|woff|woff2|ttf|eot|svg|png|jpg|jpeg|gif|ico|json|xml|webp|avif|wasm)$/i.test(path);
          if (!isResourceFile && destination !== 'script' && destination !== 'style' && destination !== 'font' && destination !== 'image') {
            // It's a real API call, not a resource
            return;
          }
          // Otherwise, it might be a resource, continue to check below
        }
        
        // AGGRESSIVE: Intercept ALL resources that look like they should be proxied
        // This includes JS files from dynamic imports, CSS, fonts, images, etc.
        const isResourceFile = /\\.(js|mjs|css|woff|woff2|ttf|eot|svg|png|jpg|jpeg|gif|ico|json|xml|webp|avif|wasm)$/i.test(path);
        const isResourcePath = path.startsWith('/frontend_latest/') || 
                               path.startsWith('/static/') ||
                               path.startsWith('/homeassistant/') ||
                               path.startsWith('/hacsfiles/') ||
                               // NOTE: /local/ is NOT proxied - loaded directly from HA for images
                               path.startsWith('/auth/') ||
                               path === '/manifest.json' ||
                               path.startsWith('/service_worker.js');
        
        // Also check if destination indicates it's a script/style/font/image
        // CRITICAL: destination === 'script' means it's a JS file being loaded (including dynamic imports)
        const isResourceDestination = destination === 'script' || 
                                      destination === 'style' || 
                                      destination === 'font' || 
                                      destination === 'image' ||
                                      destination === 'manifest' ||
                                      destination === 'worker';
        
        // Intercept if it's a resource file, resource path, or resource destination
        // PRIORITY: If destination is 'script', ALWAYS intercept (this catches dynamic imports)
        if (destination === 'script' || isResourceFile || isResourcePath || isResourceDestination) {
          // Map special paths before proxying
          let mappedPath = path;
          
          // CRITICAL: Map HACS/community resources
          if (path.startsWith('/homeassistant/www/community/') || path.startsWith('/homeassistant/www/hacs/')) {
            const pathAfterWww = path.substring('/homeassistant/www/'.length);
            mappedPath = '/hacsfiles/' + pathAfterWww;
            console.log('[HA Proxy SW] Mapped homeassistant/www/ path:', path, '->', mappedPath);
          }
          // NOTE: /local/ paths are NOT intercepted - they load directly from HA
          
          const proxyUrl = currentOrigin + '/api/ha/static' + mappedPath + (url.search || '');
          
          console.log('[HA Proxy SW] PROXYING resource:', {
            original: requestUrl,
            proxied: proxyUrl,
            method: method,
            destination: destination,
            path: path,
            mappedPath: mappedPath,
            isResourceFile: isResourceFile,
            isResourcePath: isResourcePath,
            isResourceDestination: isResourceDestination
          });
          
          // Intercept and proxy the request
          event.respondWith((async function() {
            try {
              // NOTE: Do NOT pass "mode: event.request.mode".
              // For navigation requests, event.request.mode === 'navigate' and browsers
              // reject constructing proxied Requests with that mode.
              const init = {
                method: method,
                headers: event.request.headers,
                credentials: event.request.credentials,
                redirect: event.request.redirect,
                referrer: event.request.referrer,
                referrerPolicy: event.request.referrerPolicy
              };

              if (method !== 'GET' && method !== 'HEAD') {
                // Avoid reusing the original body stream directly.
                const bodyBuf = await event.request.clone().arrayBuffer();
                init.body = bodyBuf;
              }

              const response = await fetch(proxyUrl, init);
              if (!response.ok) {
                console.error('[HA Proxy SW] Proxied request failed:', {
                  url: proxyUrl,
                  status: response.status,
                  statusText: response.statusText
                });
              } else {
                console.log('[HA Proxy SW] Proxied response OK:', {
                  url: proxyUrl,
                  status: response.status,
                  contentType: response.headers.get('content-type')
                });
              }
              return response;
            } catch (error) {
              console.error('[HA Proxy SW] Fetch error for proxied resource:', {
                url: proxyUrl,
                error: error && error.message ? error.message : String(error),
                stack: error && error.stack ? error.stack : undefined
              });
              try {
                return await fetch(event.request);
              } catch (fallbackError) {
                console.error('[HA Proxy SW] Fallback fetch also failed:', fallbackError);
                return new Response('Resource not found', { status: 404, statusText: 'Not Found' });
              }
            }
          })());
          return;
        }
        
        // For all other requests to current origin, let them through normally
        // (don't call event.respondWith(), so browser handles it)
      });
    `;
    
    res.setHeader("Content-Type", "application/javascript");
    res.setHeader("Service-Worker-Allowed", "/");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.send(swCode);
  });

  // Route for Home Assistant auth endpoints - PROXY, don't redirect.
  // Redirecting causes the browser to iframe the HA origin, which is blocked by X-Frame-Options: SAMEORIGIN.
  (app as any).all("/auth/*", async (req: Request, res: Response) => {
    if (!haBaseUrl || !haToken) {
      return res.status(500).json({ error: "HA_BASE_URL or HA_TOKEN not configured" });
    }

    const authPath = req.originalUrl; // includes "/auth/..." + query string
    const targetUrl = `${haBaseUrl}${authPath}`;
    console.log("[HA Auth] Proxying auth request to HA:", { method: req.method, authPath, targetUrl });

    try {
      // IMPORTANT: Home Assistant's frontend expects a refreshable OAuth-style token flow via /auth/token.
      // A long-lived access token cannot be refreshed, which causes the UI to fall back to the login screen.
      // We short-circuit /auth/token to always "succeed" with our server-side long-lived token so
      // the HA frontend stays authenticated and shows the dashboard.
      // Express `req.path` here includes the "/auth" prefix (e.g. "/auth/token").
      // Also, with the wildcard route "/auth/*", Express sets req.params[0] to the splat (e.g. "token").
      const splat = (req.params as any)?.[0];

      // AUTO-LOGIN: Intercept /auth/authorize and auto-complete the OAuth flow
      // When HA frontend redirects to /auth/authorize, we automatically approve it
      // and redirect back with a fake authorization code that our /auth/token handler will accept.
      if (req.path === "/auth/authorize" || req.originalUrl.startsWith("/auth/authorize") || splat === "authorize") {
        const redirectUri = (req.query.redirect_uri as string) || "/";
        const state = (req.query.state as string) || "";
        const clientId = (req.query.client_id as string) || "";
        
        console.log("[HA Auth] Auto-approving /auth/authorize:", { redirectUri, state, clientId });
        
        // Generate a fake authorization code (we'll accept any code in /auth/token)
        const fakeCode = "proxy-auth-code-" + Date.now();
        
        // Build the callback URL with the fake code
        const callbackUrl = new URL(redirectUri, req.protocol + "://" + req.get("host"));
        callbackUrl.searchParams.set("code", fakeCode);
        if (state) {
          callbackUrl.searchParams.set("state", state);
        }
        
        console.log("[HA Auth] Redirecting to callback:", callbackUrl.toString());
        
        // Allow iframe embedding and redirect
        res.setHeader("X-Frame-Options", "ALLOWALL");
        res.setHeader("Content-Security-Policy", "frame-ancestors *");
        return res.redirect(302, callbackUrl.toString());
      }

      if (req.path === "/auth/token" || req.originalUrl.startsWith("/auth/token") || splat === "token") {
        const now = Date.now();
        const expiresInSeconds = 60 * 60 * 24 * 365 * 10; // 10 years
        const payload = {
          access_token: haToken,
          token_type: "Bearer",
          // HA expects refresh_token to exist; it will call /auth/token again later.
          // Returning a stable dummy value is fine because we handle /auth/token here.
          refresh_token: "proxy-refresh-token",
          expires_in: expiresInSeconds,
          expires: now + expiresInSeconds * 1000,
        };

        res.status(200);
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        // Allow embedding of proxied auth pages within our iframe
        res.setHeader("X-Frame-Options", "ALLOWALL");
        res.setHeader("Content-Security-Policy", "frame-ancestors *");
        return res.send(JSON.stringify(payload));
      }

      const headers: Record<string, string> = {
        Authorization: `Bearer ${haToken}`,
        "User-Agent": req.headers["user-agent"]?.toString() || "Mozilla/5.0",
        Accept: req.headers["accept"]?.toString() || "*/*",
        "Accept-Language": req.headers["accept-language"]?.toString() || "en-US,en;q=0.9",
        Referer: req.headers["referer"]?.toString() || `${haBaseUrl}/`,
      };

      // Forward content-type if present (POST etc.)
      if (req.headers["content-type"]) {
        headers["Content-Type"] = req.headers["content-type"].toString();
      }

      const fetchOptions: RequestInit = {
        method: req.method,
        headers,
      };

      if (req.method !== "GET" && req.method !== "HEAD") {
        // Express may have parsed JSON; handle both string/buffer/object
        const bodyAny = (req as any).body;
        if (bodyAny !== undefined && bodyAny !== null) {
          if (typeof bodyAny === "string" || Buffer.isBuffer(bodyAny)) {
            fetchOptions.body = bodyAny as any;
          } else {
            fetchOptions.body = JSON.stringify(bodyAny);
            if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";
          }
        }
      }

      const response = await fetch(targetUrl, fetchOptions);

      // Forward status + key headers
      res.status(response.status);
      const contentType = response.headers.get("content-type");
      if (contentType) res.setHeader("Content-Type", contentType);
      const cacheControl = response.headers.get("cache-control");
      if (cacheControl) res.setHeader("Cache-Control", cacheControl);

      // IMPORTANT: allow embedding of proxied auth pages within our iframe
      res.setHeader("X-Frame-Options", "ALLOWALL");
      res.setHeader("Content-Security-Policy", "frame-ancestors *");

      const buf = Buffer.from(await response.arrayBuffer());
      return res.send(buf);
    } catch (err: any) {
      console.error("[HA Auth] Error proxying auth request:", { targetUrl, error: err?.message });
      return res.status(500).end();
    }
  });

  // Simplified route for Home Assistant static assets via /api/ha/static/*
  // Accepts any path and proxies directly to HA
  // Format: /api/ha/static/frontend_latest/core.js -> HA/frontend_latest/core.js
  // Handles all HTTP methods (GET, POST, etc.) to support endpoints like cdn-cgi/rum
  app.get("/api/ha/static/*", handleHaStaticProxy);
  app.post("/api/ha/static/*", handleHaStaticProxy);
  app.delete("/api/ha/static/*", handleHaStaticProxy);
  // Use app.use for other methods (PUT, PATCH, OPTIONS) that may not be in Express type
  (app as any).put("/api/ha/static/*", handleHaStaticProxy);
  (app as any).patch("/api/ha/static/*", handleHaStaticProxy);
  (app as any).options("/api/ha/static/*", handleHaStaticProxy);

  // Proxy route for Home Assistant static assets (JS, CSS, fonts, etc.)
  // This prevents CORS errors by proxying all resources through our server
  app.get("/api/ha/proxy/*", async (req, res) => {
    const path = req.params[0] || "";
    const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
    
    console.log("[HA Proxy] Request received:", {
      path,
      queryString,
      fullUrl: req.url,
      userAgent: req.headers['user-agent'],
    });
    
    if (!haBaseUrl || !haToken) {
      console.error("[HA Proxy] Configuration missing:", {
        hasBaseUrl: !!haBaseUrl,
        hasToken: !!haToken,
      });
      return res.status(500).json({ error: "HA_BASE_URL or HA_TOKEN not configured" });
    }

    try {
      const targetUrl = `${haBaseUrl}/${path}${queryString}`;
      console.log("[HA Proxy] Fetching from HA:", targetUrl);
      
      const response = await fetch(targetUrl, {
        headers: {
          Authorization: `Bearer ${haToken}`,
          "User-Agent": "Mozilla/5.0",
        },
      });

      console.log("[HA Proxy] Response status:", {
        path,
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get("content-type"),
        contentLength: response.headers.get("content-length"),
      });

      if (!response.ok) {
        console.warn("[HA Proxy] Failed to fetch resource:", {
          path,
          status: response.status,
          statusText: response.statusText,
          targetUrl,
        });
        return res.status(response.status).end();
      }

      // Forward content type and other headers
      const contentType = response.headers.get("content-type");
      if (contentType) {
        res.setHeader("Content-Type", contentType);
      }
      
      // Forward cache headers if present
      const cacheControl = response.headers.get("cache-control");
      if (cacheControl) {
        res.setHeader("Cache-Control", cacheControl);
      }

      // Stream the response
      const buffer = await response.arrayBuffer();
      console.log("[HA Proxy] Successfully proxied resource:", {
        path,
        size: buffer.byteLength,
        contentType,
      });
      res.send(Buffer.from(buffer));
    } catch (err: any) {
      console.error("[HA Proxy] Error proxying resource:", {
        path,
        targetUrl: `${haBaseUrl}/${path}${queryString}`,
        error: err?.message,
        stack: err?.stack,
      });
      res.status(500).end();
    }
  });

  // Helper function to process and serve proxied dashboard HTML
  function serveProxiedDashboard(
    html: string,
    res: any,
    opts?: { dashboard?: string; view?: string },
  ) {
    // Get the protocol (http/https) and convert to ws/wss for WebSocket
    const wsProtocol = haBaseUrl.startsWith("https") ? "wss" : "ws";
    const wsBaseUrl = haBaseUrl.replace(/^https?:/, wsProtocol);
    
    let hrefReplacements = 0;
    let srcReplacements = 0;
    let urlReplacements = 0;
    const replacedUrls: string[] = [];
    
    const dashboard = opts?.dashboard || "lovelace";
    const view = opts?.view || "default_view";
    const allowedPath =
      dashboard === "lovelace"
        ? `/lovelace/${encodeURIComponent(view)}`
        : `/${encodeURIComponent(dashboard)}/${encodeURIComponent(view)}`;

    // Modify the HTML to work in an iframe and inject authentication
    // Replace asset paths to go through our proxy to avoid CORS issues
    html = html
      // CRITICAL: Remove or replace <base> tags that might interfere with URL resolution
      // Home Assistant often uses <base href="/homeassistant/www/"> or similar
      // which causes all relative URLs to be resolved incorrectly
      .replace(/<base\s+[^>]*>/gi, (match) => {
        console.log("[HA Dashboard] Removing base tag:", match);
        // Replace with empty comment to preserve line numbers for debugging
        return `<!-- base tag removed: ${match.replace(/</g, '&lt;').replace(/>/g, '&gt;')} -->`;
      })
      // CRITICAL: Remove CSP meta tags (if present) because they can block our injected inline script.
      // We already set CSP headers on the proxied response.
      .replace(
        /<meta[^>]+http-equiv=["']content-security-policy["'][^>]*>/gi,
        (match) => {
          console.log("[HA Dashboard] Removing CSP meta tag:", match);
          return `<!-- csp meta removed -->`;
        },
      )
      // CRITICAL: Replace problematic path patterns that need special mapping
      // These must be done BEFORE the generic replacements to ensure correct mapping
      // Map /homeassistant/www/ paths (HACS resources) - these need to go through hacsfiles
      .replace(/=["']\/homeassistant\/www\/(community|hacs)\/([^"']+)["']/gi, (match, type, path) => {
        console.log("[HA Dashboard] Mapping homeassistant/www/ path:", match);
        // homeassistant/www/community/ -> /api/ha/static/hacsfiles/community/
        return `="/api/ha/static/hacsfiles/${type}/${path}"`;
      })
      // NOTE: /local/ paths are NOT rewritten - they load directly from HA
      // This allows images and user files to bypass the proxy
      // Replace relative asset paths to use our proxy
      // In Netlify, we need to route through /api/ha/static/* to go through serverless function
      // Replace relative URLs - use proxy to avoid CORS issues
      // Resources go through proxy, but API calls are handled separately
      // IMPORTANT: Process link tags FIRST (before generic href) to catch modulepreload
      .replace(/<link([^>]*?)href="\/([^"]+)"([^>]*?)>/gi, (match, before, path, after) => {
        // API paths stay relative
        if (path.startsWith('api/')) {
          return match;
        }
        // Auth paths must stay same-origin so our Express "/auth/*" proxy handler can answer /auth/token.
        // Rewriting /auth/* into /api/ha/static/* breaks the HA login/token refresh flow.
        if (path.startsWith('auth/')) {
          return match;
        }
        // Check if it's a modulepreload or preload link, or a resource file
        const isModulePreload = /rel=["'](?:modulepreload|preload)["']/i.test(before + after);
        const isResourceFile = /\.(js|css|woff|woff2|ttf|eot|svg|png|jpg|jpeg|gif|ico|json|xml)$/i.test(path);
        // Proxy all modulepreload/preload links and resource files
        if (isModulePreload || isResourceFile) {
          const newUrl = `/api/ha/static/${path}`;
          hrefReplacements++;
          replacedUrls.push(`<link href="/${path}"> -> <link href="${newUrl}">`);
          return `<link${before}href="${newUrl}"${after}>`;
        }
        return match;
      })
      // Then replace other href attributes (not in link tags, already processed above)
      .replace(/href="\/([^"]+)"/g, (match, path) => {
        // Skip if this is inside a link tag (already processed)
        // API paths stay relative - will be handled by JavaScript with auth
        if (path.startsWith('api/')) {
          return match;
        }
        // Auth paths must stay same-origin so our Express "/auth/*" proxy handler can answer /auth/token.
        if (path.startsWith('auth/')) {
          return match;
        }
        // All other resources go through proxy to avoid CORS
        const newUrl = `/api/ha/static/${path}`;
        hrefReplacements++;
        replacedUrls.push(`${match} -> href="${newUrl}"`);
        return `href="${newUrl}"`;
      })
      // Replace src attributes in script tags and other elements
      // CRITICAL: This must catch ALL script src attributes, including type="module"
      .replace(/<script([^>]*?)src="\/([^"]+)"([^>]*?)>/gi, (match, before, path, after) => {
        // API paths stay relative
        if (path.startsWith('api/')) {
          return match;
        }
        // Auth paths must stay same-origin so our Express "/auth/*" proxy handler can answer /auth/token.
        if (path.startsWith('auth/')) {
          return match;
        }
        // All script resources go through proxy
        const newUrl = `/api/ha/static/${path}`;
        srcReplacements++;
        replacedUrls.push(`<script src="/${path}"> -> <script src="${newUrl}">`);
        return `<script${before}src="${newUrl}"${after}>`;
      })
      // Also catch src attributes in other tags (img, iframe, etc.)
      .replace(/src="\/([^"]+)"/g, (match, path) => {
        // Skip if already processed (in script tag above)
        // API paths stay relative
        if (path.startsWith('api/')) {
          return match;
        }
        // Auth paths must stay same-origin so our Express "/auth/*" proxy handler can answer /auth/token.
        if (path.startsWith('auth/')) {
          return match;
        }
        // All other resources go through proxy
        const newUrl = `/api/ha/static/${path}`;
        srcReplacements++;
        replacedUrls.push(`${match} -> src="${newUrl}"`);
        return `src="${newUrl}"`;
      })
      .replace(/url\(['"]?\/([^'"]+)['"]?\)/g, (match, path) => {
        // API paths stay relative
        if (path.startsWith('api/')) {
          return match;
        }
        // Auth paths must stay same-origin so our Express "/auth/*" proxy handler can answer /auth/token.
        if (path.startsWith('auth/')) {
          return match;
        }
        // CSS URLs go through proxy to avoid CORS
        const newUrl = `/api/ha/static/${path}`;
        urlReplacements++;
        replacedUrls.push(`${match} -> url('${newUrl}')`);
        return `url('${newUrl}')`;
      })
      // Replace WebSocket URLs to point to Home Assistant
      .replace(/ws:\/\/[^/]+/g, wsBaseUrl)
      .replace(/wss:\/\/[^/]+/g, wsBaseUrl)
      // Inject authentication token and configuration
      // IMPORTANT: This script must run IMMEDIATELY, before any other scripts
      // Use a blocking script (no async/defer) to ensure it runs first
      .replace(
        /<head>/i,
        `<head>
          <style id="ha-proxy-kiosk-style">
            /* Kiosk-mode: hide HA chrome so the client only sees the dashboard */
            ha-sidebar,
            ha-drawer,
            app-drawer,
            .drawer,
            ha-menu-button,
            app-toolbar,
            app-header,
            app-header-layout app-header,
            app-header-layout app-toolbar,
            ha-app-layout app-header,
            ha-app-layout app-toolbar,
            ha-top-app-bar,
            ha-icon-button[title="Edit dashboard"],
            ha-icon-button[title="Editar painel"],
            ha-icon-button[title="Edit"],
            ha-icon-button[title="Editar"],
            ha-button-menu[title="Menu"],
            ha-button-menu[title="More"],
            ha-button-menu[title="Mais"],
            ha-button-menu[title="Overflow menu"],
            a[href="/config/dashboard"] {
              display: none !important;
            }
            /* Remove drawer spacing */
            ha-app-layout,
            app-drawer-layout {
              --app-drawer-width: 0px !important;
              --app-drawer-content-container: 0px !important;
            }
            /* Also collapse top app bar height if it still takes space */
            ha-app-layout {
              --app-header-height: 0px !important;
              --mdc-top-app-bar-row-height: 0px !important;
            }
          </style>
          <script>
            // BLOCKING SCRIPT - Must run before ANY other script
            // This intercepts resources BEFORE they are loaded
            // CRITICAL: Run immediately, before DOM is ready
            (function() {
              console.log('[HA Proxy] Injection script loaded and executing');

              // Lock the HA frontend to a single dashboard view (client "kiosk" mode).
              // This is a UI guardrail, not the primary security boundary (see note below).
              const __HA_ALLOWED_PATH = ${JSON.stringify(allowedPath)};

              // Kiosk mode for HA chrome:
              // HA uses nested *open* shadow roots. Scanning and mutating every element can stall
              // the UI, so instead we inject a small CSS snippet into any discovered shadow root.
              // Also, allow disabling kiosk for debugging: add ?kiosk=0 to the URL.
              (function enableKioskMode() {
                try {
                  const sp = new URLSearchParams(window.location.search || '');
                  const kioskParam = sp.get('kiosk');
                  if (kioskParam === '0' || kioskParam === 'false') {
                    console.warn('[HA Proxy] Kiosk mode disabled via query param');
                    return;
                  }

                  const KIOSK_STYLE_ID = 'ha-proxy-kiosk-style-shadow';
                  const KIOSK_CSS = ${JSON.stringify(`
/* Hide HA chrome */
ha-sidebar,
ha-drawer,
app-drawer,
ha-menu-button,
ha-top-app-bar,
app-header,
app-toolbar,
app-header-layout app-header,
app-header-layout app-toolbar {
  display: none !important;
  visibility: hidden !important;
}

/* Hide edit/overflow buttons (best-effort, titles depend on locale) */
ha-icon-button[title*="Edit" i],
ha-icon-button[title*="Editar" i],
ha-button-menu[title*="More" i],
ha-button-menu[title*="Mais" i],
ha-button-menu[title*="Menu" i],
paper-icon-button[title*="Edit" i],
paper-icon-button[title*="Editar" i],
mwc-icon-button[title*="Edit" i],
mwc-icon-button[title*="Editar" i],
a[href="/config/dashboard"] {
  display: none !important;
  visibility: hidden !important;
}

/* Remove drawer spacing */
ha-app-layout,
app-drawer-layout {
  --app-drawer-width: 0px !important;
  --app-drawer-content-container: 0px !important;
  --app-header-height: 0px !important;
  --mdc-top-app-bar-row-height: 0px !important;
}
`).trim()};

                  function ensureStyleInRoot(root) {
                    try {
                      if (!root) return;
                      // ShadowRoot doesn't have getElementById; querySelector works.
                      if (root.querySelector && root.querySelector('#' + KIOSK_STYLE_ID)) return;
                      const styleEl = document.createElement('style');
                      styleEl.id = KIOSK_STYLE_ID;
                      styleEl.textContent = KIOSK_CSS;
                      root.appendChild(styleEl);
                    } catch (e) {
                      // ignore
                    }
                  }

                  function scanForShadowRoots(startNode) {
                    try {
                      const rootEl = (startNode && startNode.nodeType === 1)
                        ? startNode
                        : document.documentElement;
                      const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_ELEMENT);
                      let n = walker.currentNode;
                      while (n) {
                        // @ts-ignore
                        if (n.shadowRoot) {
                          // @ts-ignore
                          ensureStyleInRoot(n.shadowRoot);
                        }
                        n = walker.nextNode();
                      }
                    } catch (e) {
                      // ignore
                    }
                  }

                  // Initial injection
                  ensureStyleInRoot(document.head || document.documentElement);
                  scanForShadowRoots(document.documentElement);

                  // Keep up with re-renders (only scan added subtrees)
                  const mo = new MutationObserver((mutations) => {
                    for (const m of mutations) {
                      for (const added of (m.addedNodes || [])) {
                        // Element nodes only
                        if (added && added.nodeType === 1) {
                          scanForShadowRoots(added);
                        }
                      }
                    }
                  });
                  mo.observe(document.documentElement, { childList: true, subtree: true });
                } catch (e) {
                  console.warn('[HA Proxy] Kiosk mode init failed:', e);
                }
              })();

              (function lockToDashboard() {
                function normalizePath(p) {
                  if (!p) return '/';
                  return p.endsWith('/') && p !== '/' ? p.slice(0, -1) : p;
                }
                const allowed = normalizePath(__HA_ALLOWED_PATH);

                function enforce() {
                  const current = normalizePath(window.location.pathname);
                  if (current !== allowed) {
                    console.warn('[HA Proxy] Blocking navigation away from allowed dashboard:', current, '->', allowed);
                    // Preserve search/hash so HA doesn't get stuck in reload loops
                    window.history.replaceState(null, '', allowed + window.location.search + window.location.hash);
                  }
                }

                const origPush = window.history.pushState;
                const origReplace = window.history.replaceState;
                window.history.pushState = function() {
                  // @ts-ignore
                  const r = origPush.apply(this, arguments);
                  enforce();
                  return r;
                };
                window.history.replaceState = function() {
                  // @ts-ignore
                  const r = origReplace.apply(this, arguments);
                  enforce();
                  return r;
                };
                window.addEventListener('popstate', enforce);
                // Run early + periodically (covers router-internal redirects)
                enforce();
                setInterval(enforce, 500);
              })();
              
              // Register Service Worker to intercept ALL requests including dynamic imports
              // CRITICAL: This MUST run before ANY scripts are loaded
              // Service Worker is the ONLY way to intercept ES6 dynamic imports
              if ('serviceWorker' in navigator) {
                const swUrl = '/ha-proxy-sw.js';

                // Prevent Home Assistant from registering its own service worker (e.g. /sw-modern.js)
                // on our origin. It can conflict with the proxy SW and often 404s in this embedding setup.
                try {
                  const originalRegister = navigator.serviceWorker.register.bind(navigator.serviceWorker);
                  navigator.serviceWorker.register = function(url, opts) {
                    const u = (typeof url === 'string') ? url : (url && url.toString ? url.toString() : '');
                    if (u && u !== swUrl && (u.includes('sw-modern.js') || u.includes('service_worker.js'))) {
                      console.log('[HA Proxy] Blocking HA service worker registration:', u);
                      // Return a minimal "registration-like" object.
                      return Promise.resolve({
                        scope: (opts && opts.scope) ? opts.scope : '/',
                        update: function() { return Promise.resolve(); },
                        unregister: function() { return Promise.resolve(true); },
                        installing: null,
                        waiting: null,
                        active: null,
                      });
                    }
                    return originalRegister(url, opts);
                  };
                } catch (e) {
                  // Ignore
                }
                
                // IMMEDIATE registration - don't wait for anything
                (function registerSW() {
                  // Check if already controlling
                  if (navigator.serviceWorker.controller) {
                    console.log('[HA Proxy] Service Worker already controlling:', navigator.serviceWorker.controller.scriptURL);
                    return;
                  }
                  
                  // Try to register immediately
                  navigator.serviceWorker.register(swUrl, { 
                    scope: '/',
                    updateViaCache: 'none'
                  }).then(function(registration) {
                    console.log('[HA Proxy] Service Worker registered:', registration.scope);
                    
                    // Force activation
                    if (registration.waiting) {
                      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                    }
                    
                    // Check state
                    if (registration.installing) {
                      registration.installing.addEventListener('statechange', function() {
                        if (this.state === 'activated') {
                          console.log('[HA Proxy] SW activated and ready!');
                        }
                      });
                    }
                    
                    // Listen for controller
                    navigator.serviceWorker.addEventListener('controllerchange', function() {
                      console.log('[HA Proxy] SW now controlling page!');
                    });
                  }).catch(function(error) {
                    console.error('[HA Proxy] SW registration failed:', error);
                    // Retry after a short delay
                    setTimeout(registerSW, 1000);
                  });
                })();
                
                // Also unregister old workers in background (non-blocking)
                navigator.serviceWorker.getRegistrations().then(function(registrations) {
                  registrations.forEach(function(registration) {
                    if (registration.scope !== window.location.origin + '/') {
                      registration.unregister();
                    }
                  });
                });
              } else {
                console.warn('[HA Proxy] Service Workers not supported');
              }
              // Home Assistant authentication configuration
              // HA frontend expects tokens in storage (per-origin). If they're missing,
              // it shows the login flow even if we add Authorization headers at the network layer.
              (function seedHaTokens() {
                const accessToken = ${JSON.stringify(haToken)};
                // IMPORTANT:
                // We are serving HA's frontend from *this* origin (the proxy), so HA must treat
                // the proxy origin as the "hassUrl" base for API/auth calls. If we seed the real
                // HA origin here, the frontend will try to auth against HA directly (CORS / iframe),
                // and often falls back to the login screen.
                //
                // We still rewrite WebSocket connections to the real HA origin elsewhere.
                const hassUrl = window.location.origin;
                const now = Date.now();

                // Long-lived tokens do not have refresh tokens; HA frontend still expects the field.
                // Using the same token here works because we force Authorization on all requests anyway.
                const tokens = {
                  access_token: accessToken,
                  refresh_token: accessToken,
                  token_type: "Bearer",
                  expires: now + 1000 * 60 * 60 * 24 * 365 * 10, // 10 years
                };

                try {
                  window.hassTokens = tokens;
                  window.hassUrl = hassUrl;

                  // Common HA storage keys
                  localStorage.setItem("hassTokens", JSON.stringify(tokens));
                  localStorage.setItem("hassUrl", hassUrl);
                  // Some older/newer builds use "ha" prefixed keys
                  localStorage.setItem("ha:hassTokens", JSON.stringify(tokens));
                  localStorage.setItem("ha:hassUrl", hassUrl);
                  // Some HA versions read from sessionStorage during bootstrap
                  sessionStorage.setItem("hassTokens", JSON.stringify(tokens));
                  sessionStorage.setItem("hassUrl", hassUrl);
                  sessionStorage.setItem("ha:hassTokens", JSON.stringify(tokens));
                  sessionStorage.setItem("ha:hassUrl", hassUrl);

                  console.log("[HA Proxy] Tokens seeded into storage");
                } catch (e) {
                  console.warn("[HA Proxy] Failed to seed tokens into storage:", e);
                }
              })();

              console.log('[HA Proxy] Configuration set:', {
                hasToken: true,
                hassUrl: ${JSON.stringify(haBaseUrl)}
              });
            
            // Helper function to rewrite URLs - use proxy for static assets, keep API calls relative
            function rewriteUrl(url) {
              const originalUrl = url;
              if (!url) return url;
              if (typeof url !== 'string') url = url.toString();

              const haBaseUrlValue = ${JSON.stringify(haBaseUrl)};
              const wsBaseUrlValue = (haBaseUrlValue || "").replace(/^https?:/, haBaseUrlValue.startsWith("https") ? "wss:" : "ws:");
              
              // Skip data URLs and blob URLs
              if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('#')) {
                return url;
              }

              // WebSockets: HA must connect directly to the HA origin (Netlify Functions cannot proxy WS).
              // If HA tries to use current-origin /api/websocket, rewrite to HA's ws(s) endpoint.
              if ((url.startsWith('ws://') || url.startsWith('wss://')) && url.includes('/api/websocket')) {
                try {
                  const u = new URL(url);
                  const rewritten = wsBaseUrlValue + u.pathname + (u.search || '');
                  console.log('[HA Proxy] Rewriting websocket URL:', url, '->', rewritten);
                  return rewritten;
                } catch (e) {
                  // fall through
                }
              }
              
              // Already proxied URLs - keep them (but fix double /static/ if present)
              if (url.startsWith('/api/ha/static/')) {
                // Fix double /static/ paths: /api/ha/static/static/... -> /api/ha/static/...
                if (url.startsWith('/api/ha/static/static/')) {
                  const fixed = '/api/ha/static' + url.substring('/api/ha/static/static'.length);
                  console.log('[HA Proxy] Fixing double /static/ path:', url, '->', fixed);
                  return fixed;
                }
                console.log('[HA Proxy] URL already proxied:', url);
                return url;
              }
              
              // API calls - keep relative, will be handled by fetch override
              if (url.startsWith('/api/') && !url.startsWith('/api/ha/')) {
                console.log('[HA Proxy] API call, keeping relative:', url);
                return url;
              }
              
              // CRITICAL: Map problematic Home Assistant paths before general processing
              // These are HACS/community resources that need special handling
              if (url.startsWith('/homeassistant/www/community/') || url.startsWith('/homeassistant/www/hacs/')) {
                const pathAfterWww = url.substring('/homeassistant/www/'.length);
                const rewritten = '/api/ha/static/hacsfiles/' + pathAfterWww;
                console.log('[HA Proxy] Mapping homeassistant/www/ path:', url, '->', rewritten);
                return rewritten;
              }
              
              // NOTE: /local/ paths are NOT rewritten - they load directly from HA
              // This allows images and user files to be served without proxy
              
              // Absolute URLs pointing to HA - convert to proxy
              if (haBaseUrlValue && url.startsWith(haBaseUrlValue)) {
                const path = url.substring(haBaseUrlValue.length);
                const rewritten = '/api/ha/static' + (path.startsWith('/') ? path : '/' + path);
                console.log('[HA Proxy] Rewriting HA absolute URL:', url, '->', rewritten);
                return rewritten;
              }
              
              // Absolute URLs pointing to current origin (Netlify) - convert to proxy
              // This catches resources that are being loaded directly from Netlify (including dynamic imports)
              const currentOrigin = window.location.origin;
              const currentHostname = window.location.hostname;
              
              // Check if URL matches current origin (exact match)
              if (url.startsWith(currentOrigin)) {
                const path = url.substring(currentOrigin.length);
                // If it's not already proxied and not an API call, proxy it
                if (!path.startsWith('/api/ha/') && !path.startsWith('/api/')) {
                  // Check if it looks like a resource file that should be proxied
                  const isResourceFile = /\.(js|mjs|css|woff|woff2|ttf|eot|svg|png|jpg|jpeg|gif|ico|json|xml)$/i.test(path);
                  const isResourcePath = path.startsWith('/frontend_latest/') || 
                                         path.startsWith('/static/') ||
                                         path.startsWith('/homeassistant/') ||
                                         path.startsWith('/hacsfiles/');
                                         // NOTE: /local/ NOT included - loads directly from HA
                  
                  if (isResourceFile || isResourcePath) {
                    const rewritten = '/api/ha/static' + path;
                    console.log('[HA Proxy] Rewriting current origin URL (resource):', url, '->', rewritten);
                    return rewritten;
                  }
                }
                console.log('[HA Proxy] Current origin URL already proxied or API:', url);
                return path; // Already proxied or API call
              }
              
              // CRITICAL: Also check for URLs with same hostname but different protocol (http vs https)
              // This fixes issues where Home Assistant generates http:// URLs but the site uses https://
              if (url.startsWith('http://') || url.startsWith('https://')) {
                try {
                  const urlObj = new URL(url);
                  if (urlObj.hostname === currentHostname) {
                    const path = urlObj.pathname + urlObj.search + urlObj.hash;
                    // If it's not already proxied and not an API call, proxy it
                    if (!path.startsWith('/api/ha/') && !path.startsWith('/api/')) {
                      // Check if it looks like a resource file that should be proxied
                      const isResourceFile = /\.(js|mjs|css|woff|woff2|ttf|eot|svg|png|jpg|jpeg|gif|ico|json|xml)$/i.test(path);
                      const isResourcePath = path.startsWith('/frontend_latest/') || 
                                             path.startsWith('/static/') ||
                                             path.startsWith('/homeassistant/') ||
                                             path.startsWith('/hacsfiles/');
                                             // NOTE: /local/ NOT included - loads directly from HA
                      
                      if (isResourceFile || isResourcePath) {
                        const rewritten = '/api/ha/static' + path;
                        console.log('[HA Proxy] Rewriting URL with different protocol (same hostname):', url, '->', rewritten);
                        return rewritten;
                      }
                    }
                  }
                } catch (e) {
                  // Invalid URL, continue
                }
              }
              
              // Relative URLs - use proxy
              if (url.startsWith('/')) {
                // /auth/* must stay on our origin so our Express "/auth/*" proxy can handle it.
                // Do NOT send it through /api/ha/static/* (breaks /auth/token and login flow).
                if (url.startsWith('/auth/')) {
                  console.log('[HA Proxy] Keeping auth URL same-origin:', url);
                  return url;
                }
                // Check if it's a static asset path (not API)
                if (!url.startsWith('/api/')) {
                  const rewritten = '/api/ha/static' + url;
                  console.log('[HA Proxy] Rewriting relative URL:', url, '->', rewritten);
                  return rewritten;
                }
                console.log('[HA Proxy] Relative API call, keeping as-is:', url);
                return url; // API calls stay as-is
              }
              
              // Relative URLs without leading slash - use proxy
              // This catches cases like "frontend_latest/core.js" (no leading slash)
              if (url.includes('.') && !url.startsWith('http') && !url.startsWith('//')) {
                // If it looks like a file path (has extension), proxy it
                const hasExtension = /\.(js|css|woff|woff2|ttf|eot|svg|png|jpg|jpeg|gif|ico|json|xml)$/i.test(url);
                if (hasExtension) {
                  const rewritten = '/api/ha/static/' + url;
                  console.log('[HA Proxy] Rewriting relative file URL:', url, '->', rewritten);
                  return rewritten;
                }
              }
              
              // Log unhandled URLs for debugging
              if (url && !url.startsWith('data:') && !url.startsWith('blob:') && !url.startsWith('#')) {
                console.warn('[HA Proxy] Unhandled URL (not rewritten):', url, 'original:', originalUrl);
              }
              
              return url;
            }
            
            // Override fetch to handle API calls through proxy and add auth token
            // CRITICAL: This must intercept ALL fetch requests, including those from dynamic imports
            const originalFetch = window.fetch;
            window.fetch = function(url, options = {}) {
              let urlStr = typeof url === 'string' ? url : url.toString();
              const originalUrlStr = urlStr;
              console.log('[HA Proxy] Fetch called with URL:', urlStr, 'method:', options?.method || 'GET');
              
              // CRITICAL: Check if this is a request to current origin that should be proxied
              // This catches dynamic imports that resolve to absolute URLs
              const currentOrigin = window.location.origin;
              
              // CRITICAL: Intercept ALL requests to current origin that look like resources
              // This is a fallback in case Service Worker isn't active yet
              if (urlStr.startsWith(currentOrigin)) {
                const path = urlStr.substring(currentOrigin.length);
                
                // Skip if already proxied
                if (path.startsWith('/api/ha/static/')) {
                  // Already proxied, let it through
                  return originalFetch(urlStr, options);
                }
                
                // /auth/* is handled by our server proxy at the same origin. Let it through unchanged.
                if (path.startsWith('/auth/')) {
                  return originalFetch(urlStr, options);
                }
                
                // Skip real API calls (but not resources)
                if (path.startsWith('/api/') && !path.startsWith('/api/ha/static/')) {
                  // Check if it's actually a resource (has file extension)
                  const isResourceFile = /\.(js|mjs|css|woff|woff2|ttf|eot|svg|png|jpg|jpeg|gif|ico|json|xml|webp|avif|wasm)$/i.test(path);
                  if (!isResourceFile) {
                    // Real API call, let it through
                    return originalFetch(urlStr, options);
                  }
                  // Otherwise it's a resource, continue to proxy it
                }
                
                // AGGRESSIVE: Intercept ALL resources
                const isResourceFile = /\.(js|mjs|css|woff|woff2|ttf|eot|svg|png|jpg|jpeg|gif|ico|json|xml|webp|avif|wasm)$/i.test(path);
                const isResourcePath = path.startsWith('/frontend_latest/') || 
                                       path.startsWith('/static/') ||
                                       path.startsWith('/homeassistant/') ||
                                       path.startsWith('/hacsfiles/') ||
                                       // NOTE: /local/ NOT included - loads directly from HA
                                       path === '/manifest.json';
                
                // If it's a resource, ALWAYS proxy it
                if (isResourceFile || isResourcePath) {
                  // Use rewriteUrl to handle special path mappings
                  const rewrittenPath = rewriteUrl(path);
                  const proxyUrl = currentOrigin + rewrittenPath;
                  console.log('[HA Proxy] Fetch: INTERCEPTING resource (fallback):', {
                    original: originalUrlStr,
                    proxied: proxyUrl,
                    path: path,
                    rewrittenPath: rewrittenPath,
                    isResourceFile: isResourceFile,
                    isResourcePath: isResourcePath
                  });
                  return originalFetch(proxyUrl, options).catch(function(error) {
                    console.error('[HA Proxy] Fetch error for proxied resource:', proxyUrl, error);
                    throw error;
                  });
                }
              }
              
              const rewrittenUrl = rewriteUrl(urlStr);
              
              // DOUBLE CHECK: If rewritten URL is still an absolute URL to current origin that should be proxied
              if (rewrittenUrl.startsWith(currentOrigin)) {
                const path = rewrittenUrl.substring(currentOrigin.length);
                if (!path.startsWith('/api/ha/') && !path.startsWith('/api/')) {
                  const isResourceFile = /\.(js|mjs|css|woff|woff2|ttf|eot|svg|png|jpg|jpeg|gif|ico|json|xml)$/i.test(path);
                  const isResourcePath = path.startsWith('/frontend_latest/') || 
                                         path.startsWith('/static/') ||
                                         path.startsWith('/homeassistant/') ||
                                         path.startsWith('/hacsfiles/');
                                         // NOTE: /local/ NOT included - loads directly from HA
                  
                  if (isResourceFile || isResourcePath) {
                    // Use rewriteUrl to handle special path mappings
                    const finalPath = rewriteUrl(path);
                    const proxyUrl = currentOrigin + finalPath;
                    console.log('[HA Proxy] Fetch: SECONDARY rewrite of absolute URL:', rewrittenUrl, '->', proxyUrl);
                    return originalFetch(proxyUrl, options).catch(function(error) {
                      console.error('[HA Proxy] Fetch error for proxied resource:', proxyUrl, error);
                      throw error;
                    });
                  }
                }
              }
              
              // Log URL rewrites for debugging
              if (urlStr !== rewrittenUrl) {
                console.log('[HA Proxy] Fetch URL rewritten:', urlStr, '->', rewrittenUrl);
              } else {
                console.log('[HA Proxy] Fetch URL unchanged:', urlStr);
              }
              
              // If it's an API call (relative /api/ but not /api/ha/static/), proxy it through our server
              if (urlStr.startsWith('/api/') && !urlStr.startsWith('/api/ha/static/')) {
                // Convert to absolute URL through our proxy
                const proxyUrl = window.location.origin + rewrittenUrl;
                options = options || {};
                options.headers = options.headers || {};
                options.headers['Authorization'] = 'Bearer ${haToken}';
                return originalFetch(proxyUrl, options).catch(function(error) {
                  console.error('[HA Proxy] Fetch error for:', proxyUrl, error);
                  throw error;
                });
              }
              
              // For proxied static assets, convert to absolute URL
              // This includes resources rewritten from absolute URLs
              if (rewrittenUrl.startsWith('/api/ha/static/')) {
                const proxyUrl = window.location.origin + rewrittenUrl;
                console.log('[HA Proxy] Fetch: Proxying static asset:', rewrittenUrl, '->', proxyUrl);
                return originalFetch(proxyUrl, options).catch(function(error) {
                  console.error('[HA Proxy] Fetch error for:', proxyUrl, error);
                  throw error;
                });
              }
              
              // If the original URL was an absolute URL to current origin that should be proxied
              // but wasn't caught above, try to proxy it now
              if (typeof url === 'string' && url.startsWith(currentOrigin)) {
                const path = url.substring(currentOrigin.length);
                if (!path.startsWith('/api/')) {
                  const isResourceFile = /\.(js|mjs|css|woff|woff2|ttf|eot|svg|png|jpg|jpeg|gif|ico|json|xml)$/i.test(path);
                  const isResourcePath = path.startsWith('/frontend_latest/') || 
                                         path.startsWith('/static/') ||
                                         path.startsWith('/homeassistant/') ||
                                         path.startsWith('/hacsfiles/');
                                         // NOTE: /local/ NOT included - loads directly from HA
                  
                  if (isResourceFile || isResourcePath) {
                    // Use rewriteUrl to handle special path mappings
                    const finalPath = rewriteUrl(path);
                    const proxyUrl = window.location.origin + finalPath;
                    console.log('[HA Proxy] Fetch: Late interception of resource:', url, '->', proxyUrl);
                    return originalFetch(proxyUrl, options).catch(function(error) {
                      console.error('[HA Proxy] Fetch error for:', proxyUrl, error);
                      throw error;
                    });
                  }
                }
              }
              
              // If URL points to HA and is an API call, add auth header
              const haBaseUrlValue = ${JSON.stringify(haBaseUrl)};
              const haTokenValue = ${JSON.stringify(haToken)};
              if (haBaseUrlValue && rewrittenUrl.startsWith(haBaseUrlValue) && rewrittenUrl.includes('/api/')) {
                options = options || {};
                options.headers = options.headers || {};
                options.headers['Authorization'] = 'Bearer ' + haTokenValue;
              }
              
              return originalFetch(rewrittenUrl, options).catch(function(error) {
                console.error('[HA Proxy] Fetch error for:', rewrittenUrl, error);
                throw error;
              });
            };
            
            // Override XMLHttpRequest to handle API calls through proxy and add auth token
            const originalXHROpen = XMLHttpRequest.prototype.open;
            const originalXHRSend = XMLHttpRequest.prototype.send;
            XMLHttpRequest.prototype.open = function(method, url, ...rest) {
              // Store original URL for later use
              this._haOriginalUrl = url;
              console.log('[HA Proxy] XHR.open called:', method, url);
              
              // Rewrite URL using our helper function
              let rewrittenUrl = rewriteUrl(url);
              
              // If it's a proxied static asset, convert to absolute URL
              if (rewrittenUrl.startsWith('/api/ha/static/')) {
                rewrittenUrl = window.location.origin + rewrittenUrl;
                console.log('[HA Proxy] XHR proxied static asset, absolute URL:', rewrittenUrl);
              } else if (rewrittenUrl.startsWith('/api/') && !rewrittenUrl.startsWith('/api/ha/static/')) {
                // API calls - convert to absolute URL through our proxy
                rewrittenUrl = window.location.origin + rewrittenUrl;
                console.log('[HA Proxy] XHR API call, absolute URL:', rewrittenUrl);
              }
              
              // Log URL rewrites for debugging
              if (this._haOriginalUrl !== rewrittenUrl) {
                console.log('[HA Proxy] XHR URL rewritten:', this._haOriginalUrl, '->', rewrittenUrl);
              } else {
                console.log('[HA Proxy] XHR URL unchanged:', url);
              }
              
              return originalXHROpen.call(this, method, rewrittenUrl, ...rest);
            };
            
            // Override send to add auth header for API calls
            XMLHttpRequest.prototype.send = function(data) {
              // If it's an API call, add auth header
              if (this._haOriginalUrl && this._haOriginalUrl.startsWith('/api/') && !this._haOriginalUrl.startsWith('/api/ha/static/')) {
                this.setRequestHeader('Authorization', 'Bearer ${haToken}');
              }
              return originalXHRSend.call(this, data);
            };
            
            // Override URL constructor to intercept absolute URLs
            // CRITICAL: Must handle relative URLs and invalid bases gracefully
            const originalURL = window.URL;
            window.URL = function(url, base) {
              try {
                // Convert relative base to absolute if needed
                if (base !== undefined && base !== null && typeof base === 'string') {
                  // If base is relative (starts with / but not http), convert to absolute
                  if (base.startsWith('/') && !base.startsWith('http')) {
                    base = window.location.origin + base;
                  } else if (base.startsWith('./') || base === '.' || base === '..') {
                    // Relative paths - use current location as base
                    base = window.location.href;
                  } else if (!base.startsWith('http') && !base.startsWith('data:') && !base.startsWith('blob:')) {
                    // Other relative URLs - rewrite first, then convert to absolute if still relative
                    const rewrittenBase = rewriteUrl(base);
                    if (rewrittenBase.startsWith('/') && !rewrittenBase.startsWith('http')) {
                      base = window.location.origin + rewrittenBase;
                    } else {
                      base = rewrittenBase;
                    }
                  } else {
                    // Absolute URL - just rewrite it
                    base = rewriteUrl(base);
                  }
                } else if (base === undefined || base === null) {
                  // If no base provided and url is relative, use current location
                  if (typeof url === 'string' && (url.startsWith('./') || url === '.' || url === '..' || 
                      (!url.startsWith('http') && !url.startsWith('/') && !url.startsWith('data:') && !url.startsWith('blob:')))) {
                    base = window.location.href;
                  }
                }
                
                // Handle url parameter
                if (typeof url === 'string') {
                  // Don't rewrite relative URLs that need a base (they'll be resolved against base)
                  if (url.startsWith('./') || url === '.' || url === '..') {
                    // Keep as-is, will be resolved against base
                  } else if (!url.startsWith('http') && !url.startsWith('/') && !url.startsWith('data:') && !url.startsWith('blob:')) {
                    // Relative URL without leading slash - may need base
                    if (base === undefined || base === null) {
                      base = window.location.href;
                    }
                  } else {
                    // Absolute or absolute-relative URL - rewrite it
                    url = rewriteUrl(url);
                    // If rewritten URL is relative, convert to absolute
                    if (url.startsWith('/') && !url.startsWith('http')) {
                      url = window.location.origin + url;
                    }
                  }
                }
                
                // Now both url and base should be valid for URL constructor
                if (base !== undefined && base !== null) {
                  try {
                    return new originalURL(url, base);
                  } catch (e) {
                    console.warn('[HA Proxy] URL constructor failed, using fallback:', e, {url, base});
                    // Fallback: try with current location as base
                    try {
                      return new originalURL(url, window.location.href);
                    } catch (e2) {
                      // Last resort: try without base
                      return new originalURL(url);
                    }
                  }
                }
                
                return new originalURL(url, base);
              } catch (error) {
                console.error('[HA Proxy] URL constructor error:', error, {url, base});
                // Final fallback: use original URL constructor as-is
                try {
                  return new originalURL(url, base);
                } catch (e) {
                  // If that also fails, try with current location
                  return new originalURL(url, window.location.href);
                }
              }
            };
            // Copy static methods
            window.URL.createObjectURL = originalURL.createObjectURL;
            window.URL.revokeObjectURL = originalURL.revokeObjectURL;
            
            // Override createElement to intercept script/link tags
            const originalCreateElement = document.createElement;
            document.createElement = function(tagName, options) {
              const element = originalCreateElement.call(this, tagName, options);
              
              if (tagName === 'script' || tagName === 'link') {
                console.log('[HA Proxy] createElement called for:', tagName);
                // Intercept setAttribute
                const originalSetAttribute = element.setAttribute;
                element.setAttribute = function(name, value) {
                  if ((name === 'src' || name === 'href') && typeof value === 'string') {
                    const originalValue = value;
                    value = rewriteUrl(value);
                    if (originalValue !== value) {
                      console.log('[HA Proxy] setAttribute rewritten:', name, originalValue, '->', value);
                    } else {
                      console.log('[HA Proxy] setAttribute unchanged:', name, value);
                    }
                  }
                  return originalSetAttribute.call(this, name, value);
                };
                
                // Intercept direct property assignment
                if (tagName === 'script') {
                  let srcValue = '';
                  Object.defineProperty(element, 'src', {
                    set: function(value) {
                      if (typeof value === 'string') {
                        const originalValue = value;
                        srcValue = rewriteUrl(value);
                        if (originalValue !== srcValue) {
                          console.log('[HA Proxy] Script src property rewritten:', originalValue, '->', srcValue);
                        } else {
                          console.log('[HA Proxy] Script src property unchanged:', value);
                        }
                        this.setAttribute('src', srcValue);
                      } else {
                        srcValue = value;
                      }
                    },
                    get: function() {
                      return srcValue || this.getAttribute('src') || '';
                    }
                  });
                }
                
                if (tagName === 'link') {
                  let hrefValue = '';
                  Object.defineProperty(element, 'href', {
                    set: function(value) {
                      if (typeof value === 'string') {
                        const originalValue = value;
                        hrefValue = rewriteUrl(value);
                        if (originalValue !== hrefValue) {
                          console.log('[HA Proxy] Link href property rewritten:', originalValue, '->', hrefValue);
                        } else {
                          console.log('[HA Proxy] Link href property unchanged:', value);
                      }
                        this.setAttribute('href', hrefValue);
                      } else {
                        hrefValue = value;
                      }
                    },
                    get: function() {
                      return hrefValue || this.getAttribute('href') || '';
                    }
                  });
                }
              }
              
              return element;
            };
            
            // Use MutationObserver to intercept dynamically added script/link tags
            if (document.readyState === 'loading') {
              document.addEventListener('DOMContentLoaded', function() {
                setupMutationObserver();
              });
            } else {
              setupMutationObserver();
            }
            
            function setupMutationObserver() {
              console.log('[HA Proxy] Setting up MutationObserver');
              const observer = new MutationObserver(function(mutations) {
                mutations.forEach(function(mutation) {
                  mutation.addedNodes.forEach(function(node) {
                    if (node.nodeType === 1) { // Element node
                      // Handle script tags
                      if (node.tagName === 'SCRIPT' && node.src) {
                        const originalSrc = node.src;
                        const rewritten = rewriteUrl(node.src);
                        if (originalSrc !== rewritten) {
                          node.src = rewritten;
                          console.log('[HA Proxy] MutationObserver rewrote script:', originalSrc, '->', rewritten);
                        } else {
                          console.log('[HA Proxy] MutationObserver script unchanged:', originalSrc);
                        }
                      }
                      // Handle link tags
                      if (node.tagName === 'LINK' && node.href) {
                        const originalHref = node.href;
                        const rewritten = rewriteUrl(node.href);
                        if (originalHref !== rewritten) {
                          node.href = rewritten;
                          console.log('[HA Proxy] MutationObserver rewrote link:', originalHref, '->', rewritten);
                        } else {
                          console.log('[HA Proxy] MutationObserver link unchanged:', originalHref);
                        }
                      }
                      // Handle nested scripts/links
                      const scripts = node.querySelectorAll && node.querySelectorAll('script[src], link[href]');
                      if (scripts && scripts.length > 0) {
                        console.log('[HA Proxy] MutationObserver found', scripts.length, 'nested scripts/links');
                        scripts.forEach(function(el) {
                          if (el.src) {
                            const originalSrc = el.src;
                            const rewritten = rewriteUrl(el.src);
                            if (originalSrc !== rewritten) {
                              el.src = rewritten;
                              console.log('[HA Proxy] MutationObserver rewrote nested script:', originalSrc, '->', rewritten);
                            }
                          }
                          if (el.href) {
                            const originalHref = el.href;
                            const rewritten = rewriteUrl(el.href);
                            if (originalHref !== rewritten) {
                              el.href = rewritten;
                              console.log('[HA Proxy] MutationObserver rewrote nested link:', originalHref, '->', rewritten);
                            }
                          }
                        });
                      }
                    }
                  });
                });
              });
              
              observer.observe(document.head, { childList: true, subtree: true });
              observer.observe(document.body, { childList: true, subtree: true });
              console.log('[HA Proxy] MutationObserver setup complete');
            }
            
            // Override WebSocket to point directly to HA and include auth
            const originalWebSocket = window.WebSocket;
            window.WebSocket = function(url, protocols) {
              const urlStr = typeof url === 'string' ? url : url.toString();
              let rewrittenUrl = urlStr;
              const haBaseUrlValue = ${JSON.stringify(haBaseUrl)};
              const wsBaseUrlValue = (haBaseUrlValue || "").replace(/^https?:/, haBaseUrlValue.startsWith("https") ? "wss:" : "ws:");
              
              // Ensure WebSocket URLs point to HA
              if (rewrittenUrl.includes('/api/websocket')) {
                try {
                  // Handle relative, absolute, and current-origin ws URLs by always forcing HA ws(s) origin.
                  const u = rewrittenUrl.startsWith('/') ? new URL(window.location.origin + rewrittenUrl) : new URL(rewrittenUrl, window.location.origin);
                  rewrittenUrl = wsBaseUrlValue + u.pathname + (u.search || '');
                  console.log('[HA Proxy] Forcing websocket to HA origin:', urlStr, '->', rewrittenUrl);
                } catch (e) {
                  // Last-resort fallback
                  rewrittenUrl = wsBaseUrlValue + '/api/websocket';
                }
                
                // Home Assistant WebSocket requires auth via first message
                const ws = new originalWebSocket(rewrittenUrl, protocols);
                ws.addEventListener('open', function() {
                  ws.send(JSON.stringify({ type: 'auth', access_token: '${haToken}' }));
                });
                return ws;
              }
              
              // For other WebSocket URLs, just rewrite if needed
              return new originalWebSocket(rewriteUrl(urlStr), protocols);
            };
            
            // Intercept dynamic imports
            const originalImport = window.import || (() => {});
            if (window.import) {
              window.import = function(module) {
                const rewrittenModule = rewriteUrl(module);
                return originalImport(rewrittenModule);
              };
            }
            
            // Intercept System.import if available
            if (window.System && window.System.import) {
              const originalSystemImport = window.System.import;
              window.System.import = function(module) {
                const rewrittenModule = rewriteUrl(module);
                return originalSystemImport.call(this, rewrittenModule);
              };
            }
            
            // Intercept CSS @font-face and @import URLs
            const originalInsertRule = CSSStyleSheet.prototype.insertRule;
            CSSStyleSheet.prototype.insertRule = function(rule, index) {
              if (typeof rule === 'string') {
                rule = rule.replace(/url\(['"]?([^'"]+)['"]?\)/g, function(match, url) {
                  const rewritten = rewriteUrl(url);
                  return 'url("' + rewritten + '")';
                });
              }
              return originalInsertRule.call(this, rule, index);
            };
            
            // Intercept CSSStyleSheet.addRule
            if (CSSStyleSheet.prototype.addRule) {
              const originalAddRule = CSSStyleSheet.prototype.addRule;
              CSSStyleSheet.prototype.addRule = function(selector, style, index) {
                if (typeof style === 'string') {
                  style = style.replace(/url\(['"]?([^'"]+)['"]?\)/g, function(match, url) {
                    const rewritten = rewriteUrl(url);
                    return 'url("' + rewritten + '")';
                  });
                }
                return originalAddRule.call(this, selector, style, index);
              };
            }
            
            // Intercept all existing script and link tags in the document
            // This runs immediately to catch tags that were already in the HTML
            (function interceptExistingTags() {
              // Use setTimeout to ensure DOM is ready, but run as early as possible
              if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', interceptExistingTags);
              } else {
                // DOM already ready, run immediately
                setTimeout(interceptExistingTags, 0);
              }
              
              function interceptExistingTags() {
                const scripts = document.querySelectorAll('script[src]');
                scripts.forEach(function(script) {
                  if (script.src) {
                    const originalSrc = script.src;
                    const rewritten = rewriteUrl(originalSrc);
                    if (originalSrc !== rewritten) {
                      script.src = rewritten;
                      console.log('[HA Proxy] Rewrote existing script:', originalSrc, '->', rewritten);
                    }
                  }
                });
                
                const links = document.querySelectorAll('link[href]');
                links.forEach(function(link) {
                  if (link.href) {
                    const originalHref = link.href;
                    const rewritten = rewriteUrl(originalHref);
                    if (originalHref !== rewritten) {
                      link.href = rewritten;
                      console.log('[HA Proxy] Rewrote existing link:', originalHref, '->', rewritten);
                    }
                  }
                });
              }
            })();
            })(); // End IIFE
          </script>`
      );

    console.log("[HA Dashboard] HTML processing complete:", {
      htmlLength: html.length,
      hrefReplacements,
      srcReplacements,
      urlReplacements,
      totalReplacements: hrefReplacements + srcReplacements + urlReplacements,
      replacedUrls: replacedUrls.slice(0, 10), // Log first 10 replacements
    });

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("X-Frame-Options", "ALLOWALL");
    res.setHeader("Content-Security-Policy", "frame-ancestors *");
    // Debug marker: lets you verify in DevTools Network that you are seeing injected/proxied HTML.
    res.setHeader("X-HA-Proxy", "1");
    res.send(html);
  }

  // Proxy route for Home Assistant dashboard
  // This allows embedding the full HA dashboard via iframe
  // Home Assistant frontend is a SPA that requires proper authentication
  // This route proxies the dashboard HTML and injects authentication
  async function proxyHaDashboardHtml(
    req: any,
    res: any,
    dashboard: string,
    view: string,
  ) {
    console.log("[HA Dashboard] Request received:", {
      dashboard,
      view,
      url: req.originalUrl,
      query: req.query,
      userAgent: req.headers["user-agent"],
    });

    if (!haBaseUrl || !haToken) {
      console.error("[HA Dashboard] Configuration missing:", {
        hasBaseUrl: !!haBaseUrl,
        hasToken: !!haToken,
        baseUrl: haBaseUrl || "(not set)",
      });
      return res.status(500).json({ error: "HA_BASE_URL or HA_TOKEN not configured" });
    }

    try {
      // Build dashboard URL - supports both default lovelace and custom dashboards
      // Examples:
      // - /lovelace/default_view (default dashboard)
      // - /dashboard-conex/aa (custom dashboard)
      const dashboardUrl =
        dashboard === "lovelace"
          ? `${haBaseUrl}/lovelace/${encodeURIComponent(view)}`
          : `${haBaseUrl}/${dashboard}/${encodeURIComponent(view)}`;

      console.log("[HA Dashboard] Attempting to load:", {
        dashboardUrl,
        dashboard,
        view,
      });

      const response = await fetch(dashboardUrl, {
        headers: {
          Authorization: `Bearer ${haToken}`,
          "User-Agent": req.headers["user-agent"]?.toString() ||
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });

      console.log("[HA Dashboard] Response from HA:", {
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get("content-type"),
        contentLength: response.headers.get("content-length"),
        url: dashboardUrl,
      });

      if (!response.ok) {
        console.log("[HA Dashboard] Failed to load specific dashboard, trying root:", {
          originalStatus: response.status,
          originalStatusText: response.statusText,
        });

        const rootResponse = await fetch(`${haBaseUrl}/`, {
          headers: {
            Authorization: `Bearer ${haToken}`,
            "User-Agent": req.headers["user-agent"]?.toString() ||
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
        });

        console.log("[HA Dashboard] Root response:", {
          status: rootResponse.status,
          statusText: rootResponse.statusText,
        });

        if (!rootResponse.ok) {
          console.error("[HA Dashboard] Both dashboard and root failed:", {
            dashboardUrl,
            dashboardStatus: response.status,
            rootStatus: rootResponse.status,
          });
          return res.status(rootResponse.status).json({
            error: `Failed to load dashboard: ${rootResponse.statusText}`,
            attemptedUrl: dashboardUrl,
          });
        }

        const html = await rootResponse.text();
        console.log("[HA Dashboard] Successfully loaded root dashboard, HTML length:", html.length);
        return serveProxiedDashboard(html, res, { dashboard, view });
      }

      const html = await response.text();
      console.log("[HA Dashboard] Successfully loaded dashboard, HTML length:", html.length);
      return serveProxiedDashboard(html, res, { dashboard, view });
    } catch (err: any) {
      console.error("[HA Dashboard] Error:", {
        error: err?.message,
        stack: err?.stack,
        dashboard,
        view,
      });
      return res.status(500).json({ error: `Failed to proxy dashboard: ${err?.message}` });
    }
  }

  app.get("/api/ha/dashboard", async (req, res) => {
    const dashboard = (req.query.dashboard as string) || "lovelace";
    const view = (req.query.view as string) || "default_view";
    return proxyHaDashboardHtml(req, res, dashboard, view);
  });

  // HA sometimes navigates the iframe to real dashboard paths (HTML document requests),
  // e.g. /dashboard-conex/aa or /lovelace/default_view. On Netlify this hits our function
  // and would otherwise return "Cannot GET ...". Proxy those to the dashboard endpoint.
  app.get("/dashboard-:name/:view", async (req, res) => {
    const dashboard = `dashboard-${req.params.name}`;
    const view = req.params.view || "default_view";
    return proxyHaDashboardHtml(req, res, dashboard, view);
  });

  app.get("/lovelace/:view", async (req, res) => {
    const dashboard = "lovelace";
    const view = req.params.view || "default_view";
    return proxyHaDashboardHtml(req, res, dashboard, view);
  });

  // Catch-all route for /ha/* to handle any direct navigation or resource requests
  // This ensures that if the iframe tries to navigate to /ha or load resources from /ha/*,
  // they get properly proxied to Home Assistant
  // Use app.use to match all routes starting with /ha
  app.use("/ha", async (req: any, res: any, next: any) => {
    // Only handle GET requests for now
    if (req.method !== 'GET') {
      return next();
    }
    
    // Extract path after /ha
    // req.path will be like "/ha" or "/ha/something/else"
    let path = req.path;
    if (path.startsWith('/ha')) {
      path = path.substring(3); // Remove '/ha'
      if (path.startsWith('/')) {
        path = path.substring(1); // Remove leading '/'
      }
    }
    
    // If path is empty, it's just /ha - redirect to dashboard
    if (!path || path === '') {
      const dashboard = (req.query.dashboard as string) || "lovelace";
      const view = (req.query.view as string) || "default_view";
      return res.redirect(`/api/ha/dashboard?dashboard=${encodeURIComponent(dashboard)}&view=${encodeURIComponent(view)}`);
    }
    
    const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
    
    console.log("[HA Catch-all] Request received:", {
      path,
      originalUrl: req.originalUrl,
      reqPath: req.path,
      method: req.method,
      queryString,
    });
    
    if (!haBaseUrl || !haToken) {
      console.error("[HA Catch-all] Configuration missing");
      return res.status(500).json({ error: "HA_BASE_URL or HA_TOKEN not configured" });
    }

    try {
      // Determine if this is an HTML page (dashboard) or a resource
      const targetUrl = `${haBaseUrl}/${path}${queryString}`;
      console.log("[HA Catch-all] Proxying to HA:", targetUrl);
      
      const response = await fetch(targetUrl, {
        headers: {
          Authorization: `Bearer ${haToken}`,
          "User-Agent": req.headers['user-agent'] || "Mozilla/5.0",
          Accept: req.headers.accept || "*/*",
        },
      });

      console.log("[HA Catch-all] Response:", {
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get("content-type"),
        path,
        targetUrl,
      });

      if (!response.ok) {
        console.warn("[HA Catch-all] Failed to fetch:", {
          path,
          status: response.status,
          statusText: response.statusText,
          targetUrl,
        });
        return res.status(response.status).end();
      }

      const contentType = response.headers.get("content-type") || "";
      
      // If it's HTML, process it through serveProxiedDashboard
      if (contentType.includes("text/html")) {
        const html = await response.text();
        return serveProxiedDashboard(html, res);
      }
      
      // Otherwise, proxy the resource as-is
      if (contentType) {
        res.setHeader("Content-Type", contentType);
      }
      
      const cacheControl = response.headers.get("cache-control");
      if (cacheControl) {
        res.setHeader("Cache-Control", cacheControl);
      }

      const buffer = await response.arrayBuffer();
      res.send(Buffer.from(buffer));
    } catch (err: any) {
      console.error("[HA Catch-all] Error:", {
        path,
        error: err?.message,
      });
      res.status(500).end();
    }
    // Don't call next() - we've handled the request
  });

  // Companies
  // Legacy company CRUD moved under /api/legacy (Phase 1 uses /api/companies for tenants)
  app.get("/api/legacy/companies", async (_req, res) => {
    try {
      const companies = await storage.getAllCompanies();
      res.json(companies);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch companies" });
    }
  });

  app.get("/api/legacy/companies/:id", async (req, res) => {
    try {
      const company = await storage.getCompany(req.params.id);
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }
      res.json(company);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch company" });
    }
  });

  app.post("/api/legacy/companies", async (req, res) => {
    try {
      const data = insertCompanySchema.parse(req.body);
      const company = await storage.createCompany(data);
      res.status(201).json(company);
    } catch (error: any) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: "Invalid company data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create company" });
    }
  });

  app.delete("/api/legacy/companies/:id", async (req, res) => {
    try {
      const success = await storage.deleteCompany(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Company not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete company" });
    }
  });

  // Locations
  app.get("/api/locations", async (_req, res) => {
    try {
      const locations = await storage.getAllLocations();
      res.json(locations);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch locations" });
    }
  });

  app.get("/api/locations/:id", async (req, res) => {
    try {
      const location = await storage.getLocation(req.params.id);
      if (!location) {
        return res.status(404).json({ error: "Location not found" });
      }
      res.json(location);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch location" });
    }
  });

  app.post("/api/locations", async (req, res) => {
    try {
      const data = insertLocationSchema.parse(req.body);
      
      // Check if company exists
      const company = await storage.getCompany(data.companyId);
      if (!company) {
        return res.status(400).json({ error: "Company not found" });
      }
      
      const location = await storage.createLocation(data);
      res.status(201).json(location);
    } catch (error: any) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: "Invalid location data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create location" });
    }
  });

  app.delete("/api/locations/:id", async (req, res) => {
    try {
      const success = await storage.deleteLocation(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Location not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete location" });
    }
  });

  // Lights
  app.get("/api/lights", async (_req, res) => {
    try {
      const lights = await storage.getAllLights();
      res.json(lights);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch lights" });
    }
  });

  app.get("/api/lights/:id", async (req, res) => {
    try {
      const light = await storage.getLight(req.params.id);
      if (!light) {
        return res.status(404).json({ error: "Light not found" });
      }
      res.json(light);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch light" });
    }
  });

  app.post("/api/lights", async (req, res) => {
    try {
      const data = insertLightSchema.parse(req.body);
      
      // Check if location exists
      const location = await storage.getLocation(data.locationId);
      if (!location) {
        return res.status(400).json({ error: "Location not found" });
      }
      
      const light = await storage.createLight(data);
      res.status(201).json(light);
      
      // Broadcast to WebSocket clients
      broadcastDeviceUpdate("light_update", light.id, light);
    } catch (error: any) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: "Invalid light data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create light" });
    }
  });

  app.patch("/api/lights/:id", async (req, res) => {
    try {
      const updates = updateLightSchema.parse(req.body);
      const light = await storage.updateLight(req.params.id, updates);
      if (!light) {
        return res.status(404).json({ error: "Light not found" });
      }
      res.json(light);
      
      // Broadcast to WebSocket clients
      broadcastDeviceUpdate("light_update", light.id, light);
    } catch (error: any) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: "Invalid update data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update light" });
    }
  });

  app.delete("/api/lights/:id", async (req, res) => {
    try {
      const success = await storage.deleteLight(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Light not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete light" });
    }
  });

  // TVs
  app.get("/api/tvs", async (_req, res) => {
    try {
      const tvs = await storage.getAllTvs();
      res.json(tvs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch TVs" });
    }
  });

  app.get("/api/tvs/:id", async (req, res) => {
    try {
      const tv = await storage.getTv(req.params.id);
      if (!tv) {
        return res.status(404).json({ error: "TV not found" });
      }
      res.json(tv);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch TV" });
    }
  });

  app.post("/api/tvs", async (req, res) => {
    try {
      const data = insertTvSchema.parse(req.body);
      
      // Check if location exists
      const location = await storage.getLocation(data.locationId);
      if (!location) {
        return res.status(400).json({ error: "Location not found" });
      }
      
      // Check if video exists (if provided)
      if (data.currentVideoId) {
        const video = await storage.getVideo(data.currentVideoId);
        if (!video) {
          return res.status(400).json({ error: "Video not found" });
        }
      }
      
      const tv = await storage.createTv(data);
      res.status(201).json(tv);
      
      // Broadcast to WebSocket clients
      broadcastDeviceUpdate("tv_update", tv.id, tv);
    } catch (error: any) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: "Invalid TV data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create TV" });
    }
  });

  app.patch("/api/tvs/:id", async (req, res) => {
    try {
      const updates = updateTvSchema.parse(req.body);
      
      // Check if video exists (if updating currentVideoId)
      if (updates.currentVideoId !== undefined && updates.currentVideoId !== null) {
        const video = await storage.getVideo(updates.currentVideoId);
        if (!video) {
          return res.status(400).json({ error: "Video not found" });
        }
      }
      
      const tv = await storage.updateTv(req.params.id, updates);
      if (!tv) {
        return res.status(404).json({ error: "TV not found" });
      }
      res.json(tv);
      
      // Broadcast to WebSocket clients
      broadcastDeviceUpdate("tv_update", tv.id, tv);
    } catch (error: any) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: "Invalid update data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update TV" });
    }
  });

  app.delete("/api/tvs/:id", async (req, res) => {
    try {
      const success = await storage.deleteTv(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "TV not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete TV" });
    }
  });

  // Videos
  app.get("/api/videos", async (_req, res) => {
    try {
      const videos = await storage.getAllVideos();
      res.json(videos);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch videos" });
    }
  });

  app.get("/api/videos/:id", async (req, res) => {
    try {
      const video = await storage.getVideo(req.params.id);
      if (!video) {
        return res.status(404).json({ error: "Video not found" });
      }
      res.json(video);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch video" });
    }
  });

  app.post("/api/videos", async (req, res) => {
    try {
      const data = insertVideoSchema.parse(req.body);
      const video = await storage.createVideo(data);
      res.status(201).json(video);
    } catch (error: any) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: "Invalid video data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create video" });
    }
  });

  app.delete("/api/videos/:id", async (req, res) => {
    try {
      const success = await storage.deleteVideo(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Video not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete video" });
    }
  });

  return;
}

