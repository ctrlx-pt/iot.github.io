import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = !!process.env.DATABASE_URL && process.env.RUN_INTEGRATION_TESTS === "1";

describe.runIf(hasDb)("auth + tenant isolation", () => {
  let request: typeof import("supertest").default;
  let app: any;
  let closeDb: () => Promise<void>;
  let getDb: () => any;
  let companies: any;
  let companyMemberships: any;
  let users: any;
  let eq: any;
  let hashPassword: (p: string) => string;
  let runSeed: () => Promise<void>;
  let companyAId = "";
  let companyBId = "";

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";
    request = (await import("supertest")).default;
    const appMod = await import("../../server/app");
    const dbMod = await import("../../server/db/client");
    const schemaMod = await import("../../server/db/schema");
    const drizzle = await import("drizzle-orm");
    const passMod = await import("../../server/services/crypto/password");
    const seedMod = await import("../../server/seed");

    closeDb = dbMod.closeDb;
    getDb = dbMod.getDb;
    companies = schemaMod.companies;
    companyMemberships = schemaMod.companyMemberships;
    users = schemaMod.users;
    eq = drizzle.eq;
    hashPassword = passMod.hashPassword;
    runSeed = seedMod.runSeed;

    app = await appMod.createApp();
    await runSeed();

    const db = getDb();
    const [a] = await db.select().from(companies).where(eq(companies.code, "00")).limit(1);
    const [b] = await db.select().from(companies).where(eq(companies.code, "01")).limit(1);
    companyAId = a.id;
    companyBId = b.id;

    const existing = await db.select().from(users).where(eq(users.username, "tenant.a")).limit(1);
    let userId = existing[0]?.id;
    if (!userId) {
      const [u] = await db
        .insert(users)
        .values({
          username: "tenant.a",
          passwordHash: hashPassword("changeme"),
          emailVerified: true,
          isActive: true,
        })
        .returning();
      userId = u.id;
    }
    const memberships = await db
      .select()
      .from(companyMemberships)
      .where(eq(companyMemberships.userId, userId));
    if (!memberships.find((m: any) => m.companyId === companyAId)) {
      await db.insert(companyMemberships).values({
        userId,
        companyId: companyAId,
        role: "Viewer",
      });
    }
  }, 60000);

  afterAll(async () => {
    if (closeDb) await closeDb();
  });

  async function login(username: string, password = "changeme") {
    const res = await request(app).post("/api/auth/login").send({ username, password });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    return res.body.data.accessToken as string;
  }

  it("logs in SuperAdmin", async () => {
    const token = await login(process.env.AUTH_USERNAME || "admin");
    const me = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.data.user.isSuperAdmin).toBe(true);
  });

  it("creates store with immutable storeCode", async () => {
    const token = await login("admin");
    const res = await request(app)
      .post("/api/stores")
      .set("Authorization", `Bearer ${token}`)
      .send({ companyId: companyAId, name: "Integration Store", city: "Porto" });
    expect(res.status).toBe(201);
    expect(res.body.data.storeCode).toMatch(/^ctrlx-00-\d{6}$/);

    const patch = await request(app)
      .patch(`/api/stores/${res.body.data.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ storeCode: "hacked", name: "Renamed" });
    expect(patch.status).toBe(200);
    expect(patch.body.data.storeCode).toBe(res.body.data.storeCode);
    expect(patch.body.data.name).toBe("Renamed");
  });

  it("prevents company A user from reading company B", async () => {
    const token = await login("tenant.a");
    const forbidden = await request(app)
      .get(`/api/companies/${companyBId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(forbidden.status).toBe(403);

    const list = await request(app).get("/api/companies").set("Authorization", `Bearer ${token}`);
    expect(list.status).toBe(200);
    const ids = list.body.data.map((c: { id: string }) => c.id);
    expect(ids).toContain(companyAId);
    expect(ids).not.toContain(companyBId);

    const storesB = await request(app)
      .get(`/api/companies/${companyBId}/stores`)
      .set("Authorization", `Bearer ${token}`);
    expect(storesB.status).toBe(403);
  });
});
