import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import pg from "pg";
import ws from "ws";
import * as schema from "./schema";
import { isServerlessRuntime } from "../config/runtime";

const { Pool: PgPool } = pg;

type QueryPool = pg.Pool;

let _pool: QueryPool | null = null;
let _db: ReturnType<typeof drizzlePg<typeof schema>> | null = null;

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  return url;
}

function createPool(): QueryPool {
  const url = getDatabaseUrl();

  if (isServerlessRuntime()) {
    neonConfig.webSocketConstructor = ws;
    return new NeonPool({ connectionString: url }) as unknown as QueryPool;
  }

  return new PgPool({ connectionString: url });
}

export function getPool(): QueryPool {
  if (!_pool) _pool = createPool();
  return _pool;
}

export function getDb() {
  if (_db) return _db;
  const pool = getPool();
  _db = isServerlessRuntime()
    ? drizzleNeon(pool as any, { schema })
    : drizzlePg(pool, { schema });
  return _db;
}

export type Db = ReturnType<typeof getDb>;

/** Reset cached connections (tests). */
export async function closeDb() {
  if (_pool) {
    await _pool.end();
    _pool = null;
    _db = null;
  }
}
