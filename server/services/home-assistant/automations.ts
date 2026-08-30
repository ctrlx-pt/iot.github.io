import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { getDb } from "../../db/client";
import { homeAssistantInstances } from "../../db/schema";
import { AppError } from "../../middleware/errors";
import { decryptSecret } from "../crypto/secrets";
import { HomeAssistantRestService, type HaState } from "./ha-rest";

export type AutomationView = {
  configId: string;
  entityId: string;
  name: string;
  state: string;
  lastTriggered: string | null;
  time: string | null;
  deviceEntityId: string | null;
  action: "on" | "off" | null;
};

export type SaveAutomationInput = {
  name: string;
  time: string;
  deviceEntityId: string;
  action: "on" | "off";
};

function automationName(state: HaState): string {
  const friendly = state.attributes?.friendly_name;
  return typeof friendly === "string" && friendly ? friendly : state.entity_id;
}

function configIdFromState(state: HaState): string {
  const id = state.attributes?.id;
  if (typeof id === "string" && id) return id;
  return state.entity_id.replace(/^automation\./, "");
}

async function getHaClient(instanceId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(homeAssistantInstances)
    .where(eq(homeAssistantInstances.id, instanceId))
    .limit(1);
  const inst = rows[0];
  if (!inst) throw new AppError(404, "Integration hub not found", "NOT_FOUND");
  const token = decryptSecret(inst.apiTokenEncrypted);
  return { inst, client: new HomeAssistantRestService(inst.url, token) };
}

function normalizeTime(time: string): string {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) throw new AppError(422, "Time must be HH:MM", "VALIDATION_ERROR");
  const h = Math.min(23, Math.max(0, Number(match[1])));
  const m = Math.min(59, Math.max(0, Number(match[2])));
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

export function buildAutomationConfig(configId: string, input: SaveAutomationInput) {
  const domain = input.deviceEntityId.split(".")[0] || "homeassistant";
  const service = input.action === "on" ? "turn_on" : "turn_off";
  return {
    id: configId,
    alias: input.name,
    description: "Managed by CtrlX",
    triggers: [{ platform: "time", at: normalizeTime(input.time) }],
    actions: [
      {
        service: `${domain}.${service}`,
        target: { entity_id: input.deviceEntityId },
      },
    ],
    mode: "single",
  };
}

function parseSimpleAutomation(config: Record<string, unknown>): {
  time: string | null;
  deviceEntityId: string | null;
  action: "on" | "off" | null;
} {
  const triggers = (config.triggers ?? config.trigger) as unknown;
  const actions = (config.actions ?? config.action) as unknown;
  let time: string | null = null;
  let deviceEntityId: string | null = null;
  let action: "on" | "off" | null = null;

  if (Array.isArray(triggers) && triggers[0] && typeof triggers[0] === "object") {
    const t = triggers[0] as Record<string, unknown>;
    if (t.platform === "time" && typeof t.at === "string") {
      time = t.at.slice(0, 5);
    }
  }

  if (Array.isArray(actions) && actions[0] && typeof actions[0] === "object") {
    const a = actions[0] as Record<string, unknown>;
    const svc = typeof a.service === "string" ? a.service : typeof a.action === "string" ? a.action : "";
    if (svc.endsWith(".turn_on")) action = "on";
    if (svc.endsWith(".turn_off")) action = "off";
    const target = a.target as Record<string, unknown> | undefined;
    const entity = target?.entity_id;
    if (typeof entity === "string") deviceEntityId = entity;
    else if (Array.isArray(entity) && typeof entity[0] === "string") deviceEntityId = entity[0];
  }

  return { time, deviceEntityId, action };
}

function integrationError(message: string, code = "INTEGRATION_UNAVAILABLE"): never {
  throw new AppError(502, message, code);
}

function rethrowIntegrationError(err: unknown, fallback: string): never {
  if (err instanceof AppError) throw err;
  const raw = err instanceof Error ? err.message : String(err);
  if (/404/.test(raw)) {
    integrationError(
      "Automation configuration is not available on this integration hub. Listing and running automations still works.",
    );
  }
  integrationError(fallback);
}

export async function listAutomationsForInstance(instanceId: string): Promise<{
  automations: AutomationView[];
  canManage: boolean;
}> {
  const { client } = await getHaClient(instanceId);
  const states = await client.listAutomations();
  const configs = await client.getAutomationConfigs();
  const canManage = await client.isAutomationConfigApiAvailable();
  const configById = new Map<string, Record<string, unknown>>();
  for (const cfg of configs) {
    if (cfg && typeof cfg.id === "string") configById.set(cfg.id, cfg);
  }

  const automations = states.map((state) => {
    const configId = configIdFromState(state);
    const parsed = parseSimpleAutomation(configById.get(configId) ?? {});
    return {
      configId,
      entityId: state.entity_id,
      name: automationName(state),
      state: state.state,
      lastTriggered:
        typeof state.attributes?.last_triggered === "string" ? state.attributes.last_triggered : null,
      time: parsed.time,
      deviceEntityId: parsed.deviceEntityId,
      action: parsed.action,
    };
  });

  return { automations, canManage };
}

export async function createAutomationForInstance(
  instanceId: string,
  input: SaveAutomationInput,
): Promise<{ configId: string; entityId: string }> {
  if (!input.deviceEntityId.includes(".")) {
    throw new AppError(422, "Invalid device entity", "VALIDATION_ERROR");
  }
  const configId = `ctrlx_${nanoid(8).toLowerCase()}`;
  const { client } = await getHaClient(instanceId);
  if (!(await client.isAutomationConfigApiAvailable())) {
    integrationError(
      "Cannot create automations on this integration hub. Enable the configuration API on the hub or create automations there first.",
    );
  }
  const config = buildAutomationConfig(configId, input);
  try {
    await client.saveAutomationConfig(configId, config);
  } catch (err) {
    rethrowIntegrationError(err, "Failed to create automation");
  }
  return { configId, entityId: `automation.${configId}` };
}

export async function updateAutomationForInstance(
  instanceId: string,
  configId: string,
  input: SaveAutomationInput,
): Promise<{ configId: string; entityId: string }> {
  const { client } = await getHaClient(instanceId);
  if (!(await client.isAutomationConfigApiAvailable())) {
    integrationError(
      "Cannot edit automations on this integration hub. Enable the configuration API on the hub.",
    );
  }
  const config = buildAutomationConfig(configId, input);
  try {
    await client.saveAutomationConfig(configId, config);
  } catch (err) {
    rethrowIntegrationError(err, "Failed to update automation");
  }
  return { configId, entityId: `automation.${configId}` };
}

export async function deleteAutomationForInstance(
  instanceId: string,
  configId: string,
): Promise<void> {
  const { client } = await getHaClient(instanceId);
  if (!(await client.isAutomationConfigApiAvailable())) {
    integrationError(
      "Cannot delete automations on this integration hub. Enable the configuration API on the hub.",
    );
  }
  try {
    await client.deleteAutomationConfig(configId);
  } catch (err) {
    rethrowIntegrationError(err, "Failed to delete automation");
  }
}

export async function triggerAutomationForInstance(
  instanceId: string,
  entityId: string,
): Promise<void> {
  if (!entityId.startsWith("automation.")) {
    throw new AppError(400, "entityId must be an automation entity", "BAD_REQUEST");
  }
  const { client } = await getHaClient(instanceId);
  await client.triggerAutomation(entityId);
}

export async function setAutomationEnabled(
  instanceId: string,
  entityId: string,
  enabled: boolean,
): Promise<void> {
  const { client } = await getHaClient(instanceId);
  if (enabled) await client.turnOn(entityId);
  else await client.turnOff(entityId);
}

/** @deprecated use listAutomationsForInstance */
export async function listHomeAssistantAutomations(instanceId: string) {
  const { automations } = await listAutomationsForInstance(instanceId);
  return automations.map((a) => ({
    entityId: a.entityId,
    name: a.name,
    state: a.state,
    lastTriggered: a.lastTriggered,
    editorUrl: "",
  }));
}

export const triggerHomeAssistantAutomation = triggerAutomationForInstance;
