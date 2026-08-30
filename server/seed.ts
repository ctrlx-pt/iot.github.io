import "dotenv/config";
import { pathToFileURL } from "url";
import { eq } from "drizzle-orm";
import { getDb, closeDb } from "./db/client";
import {
  companies,
  companyMemberships,
  devices,
  furniture,
  gateways,
  idCounters,
  kits,
  stores,
  users,
} from "./db/schema";
import { hashPassword } from "./services/crypto/password";
import { identifierGenerator } from "./services/identifier-generator";
import { defaultCapabilitiesForType } from "./services/tenant-scope";

async function upsertCompany(code: string, name: string, description?: string) {
  const db = getDb();
  const existing = await db.select().from(companies).where(eq(companies.code, code)).limit(1);
  if (existing[0]) return existing[0];
  const rows = await db
    .insert(companies)
    .values({ code, name, description, isActive: true })
    .returning();
  return rows[0];
}

async function ensureStore(companyId: string, companyCode: string, name: string, city: string) {
  const db = getDb();
  const existing = await db.select().from(stores).where(eq(stores.companyId, companyId));
  if (existing.length > 0) return existing[0];

  const counterKey = `store:${companyCode}`;
  const counterRows = await db
    .select()
    .from(idCounters)
    .where(eq(idCounters.counterKey, counterKey))
    .limit(1);
  if (!counterRows[0]) {
    await db.insert(idCounters).values({ counterKey, nextValue: 1 });
  }

  const storeCode = await identifierGenerator.generateStoreCode(companyCode);
  const rows = await db
    .insert(stores)
    .values({
      storeCode,
      companyId,
      name,
      city,
      country: "PT",
      timezone: "Europe/Lisbon",
      isActive: true,
    })
    .returning();
  return rows[0];
}

async function ensureUser(
  username: string,
  password: string,
  opts: { email?: string; isSuperAdmin?: boolean; resetPassword?: boolean },
) {
  const db = getDb();
  const existing = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (existing[0]) {
    const patch: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
    if (opts.isSuperAdmin && !existing[0].isSuperAdmin) {
      patch.isSuperAdmin = true;
    }
    if (opts.resetPassword) {
      patch.passwordHash = hashPassword(password);
    }
    if (opts.email && opts.email !== existing[0].email) {
      patch.email = opts.email;
    }
    await db.update(users).set(patch).where(eq(users.id, existing[0].id));
    return { ...existing[0], ...patch };
  }
  const rows = await db
    .insert(users)
    .values({
      username,
      email: opts.email,
      passwordHash: hashPassword(password),
      emailVerified: true,
      isSuperAdmin: opts.isSuperAdmin ?? false,
      isActive: true,
    })
    .returning();
  return rows[0];
}

async function ensureMembership(userId: string, companyId: string, role: string) {
  const db = getDb();
  const existing = await db
    .select()
    .from(companyMemberships)
    .where(eq(companyMemberships.userId, userId));
  const match = existing.find((m) => m.companyId === companyId);
  if (match) {
    if (match.role !== role) {
      const [updated] = await db
        .update(companyMemberships)
        .set({ role })
        .where(eq(companyMemberships.id, match.id))
        .returning();
      return updated;
    }
    return match;
  }
  const rows = await db
    .insert(companyMemberships)
    .values({ userId, companyId, role })
    .returning();
  return rows[0];
}

export async function runSeed() {
  const adminUser = process.env.AUTH_USERNAME ?? "admin";
  const adminPass = process.env.AUTH_PASSWORD ?? "changeme";
  const adminEmail = process.env.AUTH_EMAIL ?? "admin@localhost";

  const superAdmin = await ensureUser(adminUser, adminPass, {
    email: adminEmail,
    isSuperAdmin: true,
  });

  const puig = await upsertCompany("00", "PUIG", "PUIG retail group");
  const lvmh = await upsertCompany("01", "LVMH", "LVMH retail group");

  const puigStore = await ensureStore(puig.id, "00", "Store Lisbon", "Lisbon");
  const lvmhStore = await ensureStore(lvmh.id, "01", "Store Lisbon", "Lisbon");

  const puigClient = await ensureUser("puig", "changeme", {
    email: "puig@client.local",
    resetPassword: true,
  });
  const lvmhClient = await ensureUser("lvmh", "changeme", {
    email: "lvmh@client.local",
    resetPassword: true,
  });

  // Clients: CompanyAdmin (PUIG) can manage store users; LVMH stays Operator demo
  await ensureMembership(puigClient.id, puig.id, "CompanyAdmin");
  await ensureMembership(lvmhClient.id, lvmh.id, "Operator");

  await seedStoreHierarchy(puigStore);
  await seedStoreHierarchy(lvmhStore);

  console.log("Seed complete:");
  console.log(`  SuperAdmin: ${superAdmin.username} / ${adminPass}`);
  console.log(`  Company 00 PUIG → ${puigStore.storeCode}`);
  console.log(`  Company 01 LVMH → ${lvmhStore.storeCode}`);
  console.log(`  Client PUIG:  puig / changeme  (CompanyAdmin)`);
  console.log(`  Client LVMH:  lvmh / changeme  (Operator)`);
}

async function seedStoreHierarchy(store: typeof stores.$inferSelect) {
  const db = getDb();
  const existingFurn = await db.select().from(furniture).where(eq(furniture.storeId, store.id));
  if (existingFurn.length > 0) return;

  const furnitureCode = await identifierGenerator.generateFurnitureCode(store.storeCode);
  const [furn] = await db
    .insert(furniture)
    .values({
      furnitureCode,
      storeId: store.id,
      name: "Dior Display",
      position: "floor-1",
      status: "ONLINE",
    })
    .returning();

  const kitCode = await identifierGenerator.generateKitCode(store.storeCode);
  const [kit] = await db
    .insert(kits)
    .values({
      kitCode,
      furnitureId: furn.id,
      name: "Kit 01",
      kitType: "display",
      status: "ONLINE",
    })
    .returning();

  const gtwId = await identifierGenerator.generateGatewayHardwareId();
  const [gw] = await db
    .insert(gateways)
    .values({
      hardwareId: gtwId,
      name: `Gateway ${store.city || store.name}`,
      storeId: store.id,
      status: "ONLINE",
      lastSeenAt: new Date(),
      version: "1.0.0",
    })
    .returning();

  for (const spec of [
    { name: "LED Strip", type: "LED" as const },
    { name: "TV Display", type: "TV" as const },
    { name: "LED Controller", type: "LED_CONTROLLER" as const },
  ]) {
    const deviceCode = await identifierGenerator.generateDeviceCode(kit.kitCode, spec.type);
    await db.insert(devices).values({
      deviceCode,
      kitId: kit.id,
      gatewayId: gw.id,
      name: spec.name,
      deviceType: spec.type,
      status: "ONLINE",
      heartbeatSource: "mock",
      lastSeenAt: new Date(),
      configuration: JSON.stringify(
        spec.type === "LED" ? { brightness: 80, colorTemperature: 4000 } : {},
      ),
      capabilities: JSON.stringify(defaultCapabilitiesForType(spec.type)),
    });
  }
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  runSeed()
    .then(() => closeDb())
    .then(() => process.exit(0))
    .catch(async (err) => {
      console.error(err);
      await closeDb();
      process.exit(1);
    });
}
