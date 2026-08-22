export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  const isProd = process.env.NODE_ENV === "production";
  if (!secret || secret === "please-change-me") {
    if (isProd) {
      throw new Error("JWT_SECRET must be set to a strong value in production");
    }
    return secret || "dev-only-jwt-secret-change-me";
  }
  return secret;
}

export function getAccessTokenTtlSeconds(): number {
  return Number(process.env.JWT_ACCESS_TTL_SECONDS ?? 60 * 15); // 15 min
}

export function getRefreshTokenTtlSeconds(): number {
  return Number(process.env.JWT_REFRESH_TTL_SECONDS ?? 60 * 60 * 24 * 14); // 14 days
}

export const REFRESH_COOKIE_NAME = "ctrlx_refresh";
