import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const MISSING_URL =
  "DATABASE_URL is required. Add it in Vercel → Project → Settings → Environment Variables (or in .env locally).";

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

function createPool(): Pool {
  const databaseUrl = process.env.DATABASE_URL;
  const isLocal = !databaseUrl || /@(localhost|127\.0\.0\.1)(:\d+)?\//.test(databaseUrl);
  const serverless = !!process.env.VERCEL;
  // pg connects lazily, so creating the pool never touches the network (builds succeed without a DB).
  const pool = new Pool({
    connectionString: databaseUrl,
    // Hosted Postgres (Neon, Supabase, Vercel Postgres…) requires TLS.
    ssl: isLocal || /sslmode=disable/.test(databaseUrl ?? "") ? undefined : { rejectUnauthorized: false },
    // Serverless functions run many small instances — keep each pool tiny.
    max: serverless ? 3 : 10,
    idleTimeoutMillis: serverless ? 10_000 : 30_000,
    connectionTimeoutMillis: 10_000,
  });
  if (!databaseUrl) {
    // Fail with a clear message at query time instead of silently trying localhost.
    pool.connect = ((cb?: (err: Error) => void) => {
      const err = new Error(MISSING_URL);
      if (typeof cb === "function") return void cb(err);
      return Promise.reject(err);
    }) as Pool["connect"];
  }
  return pool;
}

export const pool = globalForDb.__arenaNextJsPostgresqlPool ?? createPool();
globalForDb.__arenaNextJsPostgresqlPool = pool;

export const db = drizzle(pool);
