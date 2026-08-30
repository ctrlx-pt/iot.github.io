const TOKEN_KEY = "auth_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

/** Full redirect to login — avoids 404 inside the authenticated router shell. */
export function logoutRedirect() {
  clearToken();
  if (typeof window === "undefined") return;
  const routerMode = (import.meta.env.VITE_ROUTER_MODE as string | undefined) ?? "path";
  if (routerMode === "hash") {
    window.location.replace(`${window.location.pathname}${window.location.search}#/login`);
  } else {
    window.location.replace("/login");
  }
}

/** Build full API URL from a path like "/api/auth/login" */
export function apiUrl(path: string): string {
  const base = ((import.meta as any).env?.VITE_API_BASE_URL as string | undefined) ?? "";
  const trimmedBase = base.replace(/\/+$/, "");
  if (!trimmedBase) return path;
  if (!path.startsWith("/")) return path;
  return `${trimmedBase}${path}`;
}

