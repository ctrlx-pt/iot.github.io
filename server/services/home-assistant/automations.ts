import { eq } from "drizzle-orm";
import { getDb } from "../../db/client";
import { homeAssistantInstances } from "../../db/schema";
import { AppError } from "../../middleware/errors";
import { decryptSecret } from "../crypto/secrets";
import { HomeAssistantRestService, type HaState } from "./ha-rest";

export type HaAutomationView = {
  entityId: string;
  name: string;
  state: string;
  lastTriggered: string | null;
  editorUrl: string;
};

function automationName(state: HaState): string {
  const friendly = state.attributes?.friendly_name;
  return typeof friendly === "string" && friendly ? friendly : state.entity_id;
}

function automationsEditorUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/config/automation/dashboard`;
}

export async function listHomeAssistantAutomations(instanceId: string): Promise<HaAutomationView[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(homeAssistantInstances)
    .where(eq(homeAssistantInstances.id, instanceId))
    .limit(1);
  const inst = rows[0];
  if (!inst) throw new AppError(404, "Home Assistant instance not found", "NOT_FOUND");

  const token = decryptSecret(inst.apiTokenEncrypted);
  const client = new HomeAssistantRestService(inst.url, token);
  const automations = await client.listAutomations();

  return automations.map((a) => ({
    entityId: a.entity_id,
    name: automationName(a),
    state: a.state,
    lastTriggered:
      typeof a.attributes?.last_triggered === "string" ? a.attributes.last_triggered : null,
    editorUrl: automationsEditorUrl(inst.url),
  }));
}

export async function triggerHomeAssistantAutomation(
  instanceId: string,
  entityId: string,
): Promise<void> {
  if (!entityId.startsWith("automation.")) {
    throw new AppError(400, "entityId must be an automation.* entity", "BAD_REQUEST");
  }
  const db = getDb();
  const rows = await db
    .select()
    .from(homeAssistantInstances)
    .where(eq(homeAssistantInstances.id, instanceId))
    .limit(1);
  const inst = rows[0];
  if (!inst) throw new AppError(404, "Home Assistant instance not found", "NOT_FOUND");

  const token = decryptSecret(inst.apiTokenEncrypted);
  const client = new HomeAssistantRestService(inst.url, token);
  await client.triggerAutomation(entityId);
}

/** Best-effort match: automations whose raw state mentions a device entity id. */
export function filterAutomationsForEntity(
  automations: HaState[],
  deviceEntityId: string | null,
): HaState[] {
  if (!deviceEntityId) return automations;
  const needle = deviceEntityId.toLowerCase();
  return automations.filter((a) => JSON.stringify(a).toLowerCase().includes(needle));
}

export function mapAutomationStates(states: HaState[], editorUrl: string): HaAutomationView[] {
  return states.map((a) => ({
    entityId: a.entity_id,
    name: automationName(a),
    state: a.state,
    lastTriggered:
      typeof a.attributes?.last_triggered === "string" ? a.attributes.last_triggered : null,
    editorUrl,
  }));
}
