import type { Express } from "express";
import { createAuthRouter } from "./modules/auth/routes";
import { createCompaniesRouter } from "./modules/companies/routes";
import { createStoresRouter } from "./modules/stores/routes";
import { createDashboardRouter } from "./modules/dashboard/routes";
import { createFurnitureRouter } from "./modules/furniture/routes";
import { createKitsRouter } from "./modules/kits/routes";
import { createDevicesRouter } from "./modules/devices/routes";
import { createDeviceSearchRouter } from "./modules/devices/search-routes";
import { createGatewaysRouter } from "./modules/gateways/routes";
import { createHomeAssistantRouter } from "./modules/home-assistant/routes";
import { createAutomationsRouter } from "./modules/automations/routes";
import { createMonitoringRouter } from "./modules/monitoring/routes";
import { createAuditLogsRouter } from "./modules/audit/routes";
import { createCompanyUsersRouter } from "./modules/company-users/routes";

/** SaaS API surface (Phase 1–6), registered before legacy routes. */
export function registerPhase1Routes(app: Express) {
  app.use("/api/auth", createAuthRouter());
  app.use("/api/companies", createCompaniesRouter());
  app.use("/api/stores", createStoresRouter());
  app.use("/api/furniture", createFurnitureRouter());
  app.use("/api/kits", createKitsRouter());
  app.use("/api/devices", createDevicesRouter());
  app.use("/api/device-search", createDeviceSearchRouter());
  app.use("/api/gateways", createGatewaysRouter());
  app.use("/api/home-assistant", createHomeAssistantRouter());
  app.use("/api/automations", createAutomationsRouter());
  app.use("/api/monitoring", createMonitoringRouter());
  app.use("/api/audit-logs", createAuditLogsRouter());
  app.use("/api/dashboard", createDashboardRouter());
  app.use("/api/companies/:companyId/users", createCompanyUsersRouter());
}
