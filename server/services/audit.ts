import { getDb } from "../db/client";
import { auditLogs } from "../db/schema";

export async function writeAuditLog(input: {
  companyId?: string | null;
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string | null;
}) {
  const db = getDb();
  await db.insert(auditLogs).values({
    companyId: input.companyId ?? null,
    userId: input.userId ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    oldValue: input.oldValue != null ? JSON.stringify(input.oldValue) : null,
    newValue: input.newValue != null ? JSON.stringify(input.newValue) : null,
    ipAddress: input.ipAddress ?? null,
  });
}
