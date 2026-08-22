import { z } from "zod";

export const platformRoles = [
  "SuperAdmin",
  "CompanyAdmin",
  "StoreManager",
  "Operator",
  "Viewer",
] as const;
export type PlatformRole = (typeof platformRoles)[number];

// ---------------------------------------------------------------------------
// Phase 1 — Tenant Company + Store
// ---------------------------------------------------------------------------

export const insertTenantCompanySchema = z.object({
  code: z.string().regex(/^\d{2}$/, "Company code must be 2 digits"),
  name: z.string().min(1, "Company name is required"),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const tenantCompanySchema = insertTenantCompanySchema.extend({
  id: z.string().uuid(),
  isActive: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type InsertTenantCompany = z.infer<typeof insertTenantCompanySchema>;
export type TenantCompany = z.infer<typeof tenantCompanySchema>;

export const insertStoreSchema = z.object({
  companyId: z.string().uuid(),
  name: z.string().min(1, "Store name is required"),
  description: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  timezone: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const storeSchema = z.object({
  id: z.string().uuid(),
  storeCode: z.string(),
  companyId: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  timezone: z.string(),
  isActive: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type InsertStore = z.infer<typeof insertStoreSchema>;
export type Store = z.infer<typeof storeSchema>;

export const apiEnvelopeSchema = z.object({
  success: z.boolean(),
  data: z.unknown(),
  errors: z.array(z.unknown()),
});

// Organization schemas
export const insertOrganizationSchema = z.object({
  name: z.string().min(1, "Organization name is required"),
  description: z.string().optional(),
});

export const organizationSchema = insertOrganizationSchema.extend({
  id: z.string(),
  createdAt: z.date(),
});

export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type Organization = z.infer<typeof organizationSchema>;

export const userOrganizationSchema = z.object({
  id: z.string(),
  userId: z.string(),
  organizationId: z.string(),
  role: z.enum(["owner", "admin", "member"]),
  invitedAt: z.date(),
});

export type UserOrganization = z.infer<typeof userOrganizationSchema>;

export const createInviteSchema = z.object({
  organizationId: z.string(),
  role: z.enum(["admin", "member"]).default("member"),
  invitedEmail: z.string().email().optional(),
});

export const organizationInviteSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  invitedByUserId: z.string(),
  invitedEmail: z.string().nullable(),
  inviteCode: z.string(),
  role: z.string(),
  expiresAt: z.date().nullable(),
  usedAt: z.date().nullable(),
  createdAt: z.date(),
});

export type CreateInvite = z.infer<typeof createInviteSchema>;
export type OrganizationInvite = z.infer<typeof organizationInviteSchema>;

export const userStorePermissionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  companyId: z.string(),
  canView: z.boolean().default(true),
  canEdit: z.boolean().default(false),
  createdAt: z.date(),
});

export const insertUserStorePermissionSchema = z.object({
  userId: z.string(),
  companyId: z.string(),
  canView: z.boolean().default(true),
  canEdit: z.boolean().default(false),
});

export type UserStorePermission = z.infer<typeof userStorePermissionSchema>;
export type InsertUserStorePermission = z.infer<typeof insertUserStorePermissionSchema>;

export const createUserSchema = z.object({
  username: z.string().min(3, "Nome de utilizador deve ter pelo menos 3 caracteres"),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  password: z.string().min(6, "Password deve ter pelo menos 6 caracteres"),
  role: z.enum(["admin", "member"]).default("member"),
  storePermissions: z
    .array(
      z.object({
        companyId: z.string(),
        canView: z.boolean(),
        canEdit: z.boolean(),
      }),
    )
    .optional(),
});

export type CreateUser = z.infer<typeof createUserSchema>;

/** @deprecated Legacy org-scoped company. Prefer TenantCompany + Store. */
export const insertCompanySchema = z.object({
  organizationId: z.string().min(1, "Organization ID is required"),
  name: z.string().min(1, "Company name is required"),
  description: z.string().optional(),
});

export const companySchema = insertCompanySchema.extend({
  id: z.string(),
});

export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = z.infer<typeof companySchema>;

export const insertLocationSchema = z.object({
  companyId: z.string().min(1, "Company ID is required"),
  name: z.string().min(1, "Location name is required"),
  description: z.string().optional(),
});

export const locationSchema = insertLocationSchema.extend({
  id: z.string(),
});

export type InsertLocation = z.infer<typeof insertLocationSchema>;
export type Location = z.infer<typeof locationSchema>;

export const insertLightSchema = z.object({
  locationId: z.string().min(1, "Location ID is required"),
  name: z.string().min(1, "Light name is required"),
  isOn: z.boolean().default(false),
  brightness: z.number().min(0).max(100).default(100),
  color: z.string().regex(/^#[0-9A-F]{6}$/i, "Invalid hex color").default("#ffffff"),
  status: z.enum(["online", "offline"]).default("online"),
});

export const lightSchema = insertLightSchema.extend({
  id: z.string(),
});

export const updateLightSchema = z.object({
  name: z.string().min(1).optional(),
  isOn: z.boolean().optional(),
  brightness: z.number().min(0).max(100).optional(),
  color: z.string().regex(/^#[0-9A-F]{6}$/i, "Invalid hex color").optional(),
  status: z.enum(["online", "offline"]).optional(),
});

export type InsertLight = z.infer<typeof insertLightSchema>;
export type Light = z.infer<typeof lightSchema>;
export type UpdateLight = z.infer<typeof updateLightSchema>;

export const insertVideoSchema = z.object({
  name: z.string().min(1, "Video name is required"),
  url: z.string().url("Invalid video URL"),
  duration: z.number().min(1).optional(),
});

export const videoSchema = insertVideoSchema.extend({
  id: z.string(),
  uploadedAt: z.date(),
});

export type InsertVideo = z.infer<typeof insertVideoSchema>;
export type Video = z.infer<typeof videoSchema>;

export const insertTvSchema = z.object({
  locationId: z.string().min(1, "Location ID is required"),
  name: z.string().min(1, "TV name is required"),
  currentVideoId: z.string().optional(),
  isLooping: z.boolean().default(true),
  status: z.enum(["online", "offline"]).default("online"),
});

export const tvSchema = insertTvSchema.extend({
  id: z.string(),
});

export const updateTvSchema = z.object({
  name: z.string().min(1).optional(),
  currentVideoId: z.string().nullable().optional(),
  isLooping: z.boolean().optional(),
  status: z.enum(["online", "offline"]).optional(),
});

export type InsertTv = z.infer<typeof insertTvSchema>;
export type Tv = z.infer<typeof tvSchema>;
export type UpdateTv = z.infer<typeof updateTvSchema>;

export const deviceUpdateMessageSchema = z.object({
  type: z.enum(["light_update", "tv_update"]),
  deviceId: z.string(),
  data: z.union([lightSchema, tvSchema, updateLightSchema, updateTvSchema]),
});

export const deviceStatusMessageSchema = z.object({
  type: z.literal("status_update"),
  deviceId: z.string(),
  deviceType: z.enum(["light", "tv"]),
  status: z.enum(["online", "offline"]),
});

export type DeviceUpdateMessage = z.infer<typeof deviceUpdateMessageSchema>;
export type DeviceStatusMessage = z.infer<typeof deviceStatusMessageSchema>;
