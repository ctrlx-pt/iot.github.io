import crypto from "crypto";
import { getJwtSecret } from "../../config/env";

function base64url(input: Buffer | string) {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export function signJwt(payload: Record<string, unknown>, expiresInSeconds: number): string {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + expiresInSeconds };
  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(body));
  const data = `${headerB64}.${payloadB64}`;
  const signature = base64url(
    crypto.createHmac("sha256", getJwtSecret()).update(data).digest(),
  );
  return `${data}.${signature}`;
}

export function verifyJwt(token: string): Record<string, any> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signature] = parts;
  const data = `${headerB64}.${payloadB64}`;
  const expectedSig = base64url(
    crypto.createHmac("sha256", getJwtSecret()).update(data).digest(),
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

export function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function generateRefreshTokenRaw(): string {
  return randomToken(48);
}

function randomToken(bytes: number): string {
  return base64url(crypto.randomBytes(bytes));
}
