import { QueryClient } from "@tanstack/react-query";
import { getToken, clearToken } from "./auth";

function redirectToLoginIfUnauthorized(res: Response, bodyText: string) {
  if (res.status !== 401) return;
  // CtrlX session JWT — not the Home Assistant long-lived token
  const looksLikeSession =
    bodyText.includes("Invalid or expired token") ||
    bodyText.includes('"UNAUTHORIZED"') ||
    bodyText.includes("Unauthorized");
  if (!looksLikeSession) return;
  clearToken();
  if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
    window.location.assign("/login");
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    redirectToLoginIfUnauthorized(res, text);
    throw new Error(`${res.status}: ${text}`);
  }
}

function getApiBaseUrl() {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";
  return base.replace(/\/+$/, "");
}

function withApiBase(url: string) {
  const base = getApiBaseUrl();
  if (!base) return url;
  if (!url.startsWith("/")) return url;
  return `${base}${url}`;
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function getCredentials(): RequestCredentials {
  const mode = (import.meta.env.VITE_API_CREDENTIALS as string | undefined) ?? "include";
  return mode === "omit" ? "omit" : "include";
}

/** Unwrap Phase 1 `{ success, data }` envelopes; pass through legacy JSON. */
export function unwrapApiData<T = unknown>(json: any): T {
  if (json && typeof json === "object" && "success" in json && "data" in json) {
    if (json.success === false) {
      const msg =
        json.errors?.[0]?.message ||
        (typeof json.errors?.[0] === "string" ? json.errors[0] : null) ||
        "Request failed";
      throw new Error(msg);
    }
    return json.data as T;
  }
  return json as T;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers: Record<string, string> = { ...authHeaders() };
  if (data) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(withApiBase(url), {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: getCredentials(),
  });

  await throwIfResNotOk(res);
  return res;
}

export async function apiJson<T>(method: string, url: string, data?: unknown): Promise<T> {
  const res = await apiRequest(method, url, data);
  const json = await res.json();
  return unwrapApiData<T>(json);
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => (ctx: { queryKey: any[] }) => Promise<T | null> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = withApiBase(queryKey.join("/") as string);
    const res = await fetch(url, {
      headers: authHeaders(),
      credentials: getCredentials(),
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      clearToken();
      return null;
    }

    await throwIfResNotOk(res);
    const json = await res.json();
    return unwrapApiData<T>(json);
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
