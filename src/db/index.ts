import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

const databaseUrl = process.env.DATABASE_URL;

function poolConfig(): PoolConfig {
  const config: PoolConfig = {
    connectionString: databaseUrl,
    // Serverless (Vercel) runs many small instances — keep each pool small.
    max: process.env.VERCEL ? 5 : 10,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 15_000,
  };
  if (databaseUrl) {
    try {
      const { hostname, searchParams } = new URL(databaseUrl);
      const local = ["localhost", "127.0.0.1", "::1"].includes(hostname) || hostname.endsWith(".local");
      // Hosted Postgres (Neon, Supabase…) requires TLS. Respect sslmode when the URL sets it.
      if (!local && !searchParams.has("sslmode") && !searchParams.has("ssl")) config.ssl = { rejectUnauthorized: false };
    } catch {
      /* invalid URL — pg reports a clear error on first query */
    }
  }
  return config;
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

function createPool() {
  const p = new Pool(poolConfig());
  // Idle connections can be closed by the provider (e.g. Neon auto-suspend). Log instead of crashing.
  p.on("error", (err) => console.error("Postgres pool error:", err.message));
  return p;
}

export const pool = globalForDb.__arenaNextJsPostgresqlPool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);
