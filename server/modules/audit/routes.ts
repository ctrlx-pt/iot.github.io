import { Router } from "express";
import { desc, inArray } from "drizzle-orm";
import { getDb } from "../../db/client";
import { auditLogs } from "../../db/schema";
import { accessibleCompanyIds, authenticate } from "../../middleware/auth";
import { asyncHandler, ok } from "../../middleware/errors";

export function createAuditLogsRouter(): Router {
  const router = Router();
  router.use(authenticate);

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const db = getDb();
      const scope = accessibleCompanyIds(req.user!);
      const limit = Math.min(Number(req.query.limit ?? 100), 500);
      const rows =
        scope === "all"
          ? await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit)
          : scope.length === 0
            ? []
            : await db
                .select()
                .from(auditLogs)
                .where(inArray(auditLogs.companyId, scope))
                .orderBy(desc(auditLogs.createdAt))
                .limit(limit);
      return ok(res, rows);
    }),
  );

  return router;
}
