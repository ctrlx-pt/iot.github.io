/**
 * Home Assistant REST lives at `{origin}[/subdir]/api/...`.
 * Users often paste a dashboard UI URL (`/dashboard/console`, `/lovelace/...`).
 * Those return HTML, which then fails JSON.parse during discover/sync.
 */
const UI_SUFFIXES = [
  /\/api\/states(?:\/.*)?$/i,
  /\/api$/i,
  /\/lovelace(?:\/.*)?$/i,
  /\/dashboard-[^/]+(?:\/.*)?$/i,
  /\/dashboards(?:\/.*)?$/i,
  /\/dashboard(?:\/.*)?$/i,
  /\/auth(?:\/.*)?$/i,
  /\/hacsfiles(?:\/.*)?$/i,
];

export function normalizeHomeAssistantBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Home Assistant URL is required");
  }

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new Error("Invalid Home Assistant URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Home Assistant URL must be http or https");
  }

  let path = (parsed.pathname || "/").replace(/\/+$/, "");
  let previous = "";
  while (path && path !== previous) {
    previous = path;
    for (const re of UI_SUFFIXES) {
      path = path.replace(re, "");
    }
    path = path.replace(/\/+$/, "");
  }

  const origin = `${parsed.protocol}//${parsed.host}`;
  return path ? `${origin}${path}` : origin;
}
