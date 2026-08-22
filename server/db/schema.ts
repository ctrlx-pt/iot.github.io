import {
  pgTable,
  text,
  boolean,
  integer,
  timestamp,
  uuid,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/** Platform roles (RBAC). SuperAdmin is platform-scoped. */
export const PLATFORM_ROLES = [
  "SuperAdmin",
  "CompanyAdmin",
  "StoreManager",
  "Operator",
  "Viewer",
] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

// ---------------------------------------------------------------------------
// Core Phase 1: users, companies (tenants), stores
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(),
  email: text("email").unique(),
  passwordHash: text("password_hash").notNull(),
  emailVerified: boolean("email_verified").notNull().default(false),
  isSuperAdmin: boolean("is_super_admin").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const companies = pgTable(
  "companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    codeIdx: uniqueIndex("companies_code_uidx").on(t.code),
  }),
);

export const stores = pgTable(
  "stores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeCode: text("store_code").notNull(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    address: text("address"),
    city: text("city"),
    country: text("country"),
    timezone: text("timezone").notNull().default("Europe/Lisbon"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    storeCodeIdx: uniqueIndex("stores_store_code_uidx").on(t.storeCode),
    companyIdIdx: index("stores_company_id_idx").on(t.companyId),
  }),
);

export const companyMemberships = pgTable(
  "company_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("Viewer"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userCompanyIdx: uniqueIndex("company_memberships_user_company_uidx").on(
      t.userId,
      t.companyId,
    ),
    companyIdIdx: index("company_memberships_company_id_idx").on(t.companyId),
    userIdIdx: index("company_memberships_user_id_idx").on(t.userId),
  }),
);

export const storeAssignments = pgTable(
  "store_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userStoreIdx: uniqueIndex("store_assignments_user_store_uidx").on(t.userId, t.storeId),
    storeIdIdx: index("store_assignments_store_id_idx").on(t.storeId),
  }),
);

export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tokenHashIdx: uniqueIndex("refresh_tokens_token_hash_uidx").on(t.tokenHash),
    userIdIdx: index("refresh_tokens_user_id_idx").on(t.userId),
  }),
);

/** Sequential counters for business IDs (store / furniture / kit / gateway). */
export const idCounters = pgTable(
  "id_counters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    counterKey: text("counter_key").notNull(),
    nextValue: integer("next_value").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    counterKeyIdx: uniqueIndex("id_counters_key_uidx").on(t.counterKey),
  }),
);

// ---------------------------------------------------------------------------
// Phase 2+: physical hierarchy + HA + automations + audit
// ---------------------------------------------------------------------------

export const DEVICE_TYPES = [
  "LED",
  "LED_CONTROLLER",
  "TV",
  "DISPLAY",
  "RELAY",
  "SENSOR",
  "POWER_CONTROLLER",
  "NOVASTAR",
  "OTHER",
] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];

export const ENTITY_STATUSES = ["ONLINE", "OFFLINE", "WARNING", "UNKNOWN"] as const;
export type EntityStatus = (typeof ENTITY_STATUSES)[number];

export const homeAssistantInstances = pgTable(
  "home_assistant_instances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    apiTokenEncrypted: text("api_token_encrypted").notNull(),
    status: text("status").notNull().default("UNKNOWN"),
    version: text("version"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    storeIdIdx: index("ha_instances_store_id_idx").on(t.storeId),
  }),
);

export const gateways = pgTable(
  "gateways",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hardwareId: text("hardware_id").notNull(),
    name: text("name").notNull(),
    serialNumber: text("serial_number"),
    ipAddress: text("ip_address"),
    macAddress: text("mac_address"),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    homeAssistantInstanceId: uuid("home_assistant_instance_id").references(
      () => homeAssistantInstances.id,
      { onDelete: "set null" },
    ),
    status: text("status").notNull().default("UNKNOWN"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    version: text("version"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    hardwareIdIdx: uniqueIndex("gateways_hardware_id_uidx").on(t.hardwareId),
    storeIdIdx: index("gateways_store_id_idx").on(t.storeId),
  }),
);

export const furniture = pgTable(
  "furniture",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    furnitureCode: text("furniture_code").notNull(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    position: text("position"),
    status: text("status").notNull().default("UNKNOWN"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    furnitureCodeIdx: uniqueIndex("furniture_code_uidx").on(t.furnitureCode),
    storeIdIdx: index("furniture_store_id_idx").on(t.storeId),
  }),
);

export const kits = pgTable(
  "kits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kitCode: text("kit_code").notNull(),
    furnitureId: uuid("furniture_id")
      .notNull()
      .references(() => furniture.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    kitType: text("kit_type").default("standard"),
    status: text("status").notNull().default("UNKNOWN"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    kitCodeIdx: uniqueIndex("kits_kit_code_uidx").on(t.kitCode),
    furnitureIdIdx: index("kits_furniture_id_idx").on(t.furnitureId),
  }),
);

export const devices = pgTable(
  "devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deviceCode: text("device_code").notNull(),
    kitId: uuid("kit_id")
      .notNull()
      .references(() => kits.id, { onDelete: "cascade" }),
    gatewayId: uuid("gateway_id").references(() => gateways.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    deviceType: text("device_type").notNull().default("OTHER"),
    manufacturer: text("manufacturer"),
    model: text("model"),
    serialNumber: text("serial_number"),
    status: text("status").notNull().default("UNKNOWN"),
    homeAssistantEntityId: text("home_assistant_entity_id"),
    configuration: text("configuration").notNull().default("{}"),
    capabilities: text("capabilities").notNull().default("[]"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    deviceCodeIdx: uniqueIndex("devices_device_code_uidx").on(t.deviceCode),
    kitIdIdx: index("devices_kit_id_idx").on(t.kitId),
    gatewayIdIdx: index("devices_gateway_id_idx").on(t.gatewayId),
  }),
);

export const homeAssistantEntities = pgTable(
  "home_assistant_entities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    homeAssistantInstanceId: uuid("home_assistant_instance_id")
      .notNull()
      .references(() => homeAssistantInstances.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    entityId: text("entity_id").notNull(),
    entityType: text("entity_type").notNull(),
    friendlyName: text("friendly_name"),
    isAvailable: boolean("is_available").notNull().default(true),
    lastState: text("last_state"),
    lastUpdatedAt: timestamp("last_updated_at", { withTimezone: true }),
  },
  (t) => ({
    deviceIdIdx: index("ha_entities_device_id_idx").on(t.deviceId),
    instanceEntityIdx: uniqueIndex("ha_entities_instance_entity_uidx").on(
      t.homeAssistantInstanceId,
      t.entityId,
    ),
  }),
);

export const automations = pgTable(
  "automations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    scopeType: text("scope_type").notNull(), // Company | Store | Furniture | Kit | Device
    scopeId: text("scope_id").notNull(),
    triggerType: text("trigger_type").notNull(), // time | manual | device_state | schedule | webhook | sensor
    configuration: text("configuration").notNull().default("{}"),
    isEnabled: boolean("is_enabled").notNull().default(true),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    companyIdIdx: index("automations_company_id_idx").on(t.companyId),
  }),
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    companyIdIdx: index("audit_logs_company_id_idx").on(t.companyId),
    createdAtIdx: index("audit_logs_created_at_idx").on(t.createdAt),
  }),
);

// Email verification codes for 2FA (legacy-compatible)
export const verificationCodes = pgTable("verification_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  type: text("type").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Legacy tables (kept so existing HA / light / TV routes continue to compile)
// ---------------------------------------------------------------------------

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userOrganizations = pgTable("user_organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
  invitedAt: timestamp("invited_at", { withTimezone: true }).notNull().defaultNow(),
});

export const organizationInvites = pgTable("organization_invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  invitedByUserId: uuid("invited_by_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  invitedEmail: text("invited_email"),
  inviteCode: text("invite_code").notNull().unique(),
  role: text("role").notNull().default("member"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** @deprecated Use `stores` — legacy "company" rows that acted as stores. */
export const legacyCompanies = pgTable("legacy_companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
});

export const locations = pgTable("locations", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => legacyCompanies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
});

export const lights = pgTable("lights", {
  id: uuid("id").primaryKey().defaultRandom(),
  locationId: uuid("location_id")
    .notNull()
    .references(() => locations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  isOn: boolean("is_on").notNull().default(false),
  brightness: integer("brightness").notNull().default(100),
  color: text("color").notNull().default("#ffffff"),
  status: text("status").notNull().default("online"),
});

export const videos = pgTable("videos", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  duration: integer("duration"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tvs = pgTable("tvs", {
  id: uuid("id").primaryKey().defaultRandom(),
  locationId: uuid("location_id")
    .notNull()
    .references(() => locations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  currentVideoId: uuid("current_video_id").references(() => videos.id, { onDelete: "set null" }),
  isLooping: boolean("is_looping").notNull().default(true),
  status: text("status").notNull().default("online"),
});

export const userStorePermissions = pgTable("user_store_permissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  companyId: uuid("company_id")
    .notNull()
    .references(() => legacyCompanies.id, { onDelete: "cascade" }),
  canView: boolean("can_view").notNull().default(true),
  canEdit: boolean("can_edit").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const activityLogs = pgTable("activity_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  organizationId: uuid("organization_id").references(() => organizations.id, {
    onDelete: "cascade",
  }),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  entityName: text("entity_name"),
  details: text("details"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const energyUsage = pgTable("energy_usage", {
  id: uuid("id").primaryKey().defaultRandom(),
  locationId: uuid("location_id").references(() => locations.id, { onDelete: "cascade" }),
  lightId: uuid("light_id").references(() => lights.id, { onDelete: "cascade" }),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  kwh: integer("kwh").notNull().default(0),
  brightness: integer("brightness"),
  isOn: boolean("is_on"),
});

export const schedules = pgTable("schedules", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id, {
    onDelete: "cascade",
  }),
  locationId: uuid("location_id").references(() => locations.id, { onDelete: "cascade" }),
  lightId: uuid("light_id").references(() => lights.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  action: text("action").notNull(),
  actionValue: text("action_value"),
  cronExpression: text("cron_expression"),
  scheduledTime: timestamp("scheduled_time", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const accessGroups = pgTable("access_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  level: integer("level").notNull().default(5),
  description: text("description"),
  permissions: text("permissions").notNull().default("{}"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userAccessGroups = pgTable("user_access_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accessGroupId: uuid("access_group_id")
    .notNull()
    .references(() => accessGroups.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const brands = pgTable("brands", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  category: text("category").notNull().default("lighting"),
  website: text("website"),
  logo: text("logo"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const maintenanceRequests = pgTable("maintenance_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  companyId: uuid("company_id").references(() => legacyCompanies.id, { onDelete: "cascade" }),
  locationId: uuid("location_id").references(() => locations.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  type: text("type").notNull().default("maintenance"),
  priority: text("priority").notNull().default("medium"),
  status: text("status").notNull().default("open"),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  assignedToId: uuid("assigned_to_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const mediaContent = pgTable("media_content", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull(),
  url: text("url").notNull(),
  size: integer("size"),
  duration: integer("duration"),
  folder: text("folder").default("root"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const mediaPlaylists = pgTable("media_playlists", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  isLoop: boolean("is_loop").notNull().default(true),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const playlistItems = pgTable("playlist_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  playlistId: uuid("playlist_id")
    .notNull()
    .references(() => mediaPlaylists.id, { onDelete: "cascade" }),
  contentId: uuid("content_id")
    .notNull()
    .references(() => mediaContent.id, { onDelete: "cascade" }),
  order: integer("order").notNull().default(0),
  duration: integer("duration"),
});
