import { normalizeHomeAssistantBaseUrl } from "../../../shared/ha-url";

export type HaState = {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed?: string;
  last_updated?: string;
};

export interface IHomeAssistantService {
  getStates(): Promise<HaState[]>;
  getState(entityId: string): Promise<HaState | null>;
  turnOn(entityId: string, data?: Record<string, unknown>): Promise<void>;
  turnOff(entityId: string): Promise<void>;
  toggle(entityId: string): Promise<void>;
  setBrightness(entityId: string, brightness: number): Promise<void>;
  setColor(entityId: string, color: string | number[]): Promise<void>;
  callService(
    domain: string,
    service: string,
    entityId: string,
    data?: Record<string, unknown>,
  ): Promise<void>;
  listAutomations(): Promise<HaState[]>;
  triggerAutomation(entityId: string): Promise<void>;
}

export class HomeAssistantRestService implements IHomeAssistantService {
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly token: string,
  ) {
    this.baseUrl = normalizeHomeAssistantBaseUrl(baseUrl);
  }

  private url(path: string) {
    return `${this.baseUrl.replace(/\/+$/, "")}${path}`;
  }

  private parseJson(method: string, path: string, requestUrl: string, contentType: string | null, text: string) {
    const looksHtml =
      /^\s*</.test(text) || (contentType || "").toLowerCase().includes("text/html");
    if (looksHtml) {
      throw new Error(
        `Home Assistant returned a web page instead of the API (${method} ${path}). Use the Home Assistant origin (e.g. https://ha.example.com), not a dashboard URL such as /dashboard/console. Requested: ${requestUrl}`,
      );
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(
        `Home Assistant returned invalid JSON (${method} ${path}). Requested: ${requestUrl}`,
      );
    }
  }

  private async request(method: string, path: string, body?: unknown) {
    const requestUrl = this.url(path);
    const res = await fetch(requestUrl, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: body != null ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      const text = await res.text();
      const looksHtml =
        /^\s*</.test(text) || (res.headers.get("content-type") || "").toLowerCase().includes("text/html");
      if (looksHtml) {
        throw new Error(
          `Home Assistant returned HTTP ${res.status} HTML instead of JSON (${method} ${path}). Use the Home Assistant origin, not a dashboard page. Requested: ${requestUrl}`,
        );
      }
      throw new Error(`Home Assistant ${method} ${path} failed: ${res.status} ${text.slice(0, 300)}`);
    }
    if (res.status === 204) return null;
    const text = await res.text();
    return text
      ? this.parseJson(method, path, requestUrl, res.headers.get("content-type"), text)
      : null;
  }

  async getStates(): Promise<HaState[]> {
    return (await this.request("GET", "/api/states")) as HaState[];
  }

  async getState(entityId: string): Promise<HaState | null> {
    try {
      return (await this.request("GET", `/api/states/${encodeURIComponent(entityId)}`)) as HaState;
    } catch {
      return null;
    }
  }

  async callService(
    domain: string,
    service: string,
    entityId: string,
    data: Record<string, unknown> = {},
  ): Promise<void> {
    await this.request("POST", `/api/services/${domain}/${service}`, {
      entity_id: entityId,
      ...data,
    });
  }

  async listAutomations(): Promise<HaState[]> {
    const states = await this.getStates();
    return states.filter((s) => s.entity_id.startsWith("automation."));
  }

  async triggerAutomation(entityId: string): Promise<void> {
    await this.request("POST", "/api/services/automation/trigger", {
      entity_id: entityId,
    });
  }

  async turnOn(entityId: string, data?: Record<string, unknown>): Promise<void> {
    const domain = entityId.split(".")[0] || "homeassistant";
    await this.callService(domain, "turn_on", entityId, data);
  }

  async turnOff(entityId: string): Promise<void> {
    const domain = entityId.split(".")[0] || "homeassistant";
    await this.callService(domain, "turn_off", entityId);
  }

  async toggle(entityId: string): Promise<void> {
    const domain = entityId.split(".")[0] || "homeassistant";
    await this.callService(domain, "toggle", entityId);
  }

  async setBrightness(entityId: string, brightness: number): Promise<void> {
    const pct = Math.max(0, Math.min(100, brightness));
    await this.turnOn(entityId, { brightness_pct: pct });
  }

  async setColor(entityId: string, color: string | number[]): Promise<void> {
    if (typeof color === "string") {
      await this.turnOn(entityId, { rgb_color: hexToRgb(color) });
    } else {
      await this.turnOn(entityId, { rgb_color: color });
    }
  }
}

function hexToRgb(hex: string): number[] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Placeholder for future WebSocket event stream from HA. */
export class HomeAssistantWebSocketBridge {
  // Architecture hook — connect to HA websocket API and push state changes.
  connect(_url: string, _token: string, _onState: (state: HaState) => void) {
    // not implemented in this phase
  }
}
