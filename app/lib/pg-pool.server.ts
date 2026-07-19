/**
 * Shared PostgreSQL pool for Railway/production.
 * Handles idle connection drops without crashing the Node process.
 */

import pg from "pg";

const { Pool } = pg;

let pool: pg.Pool | null | undefined;

function buildPool(): pg.Pool | null {
  const databaseUrl = process.env.DATABASE_URL;
  const connectionString = databaseUrl?.replace(/^postgres:\/\//, "postgresql://");
  if (!connectionString) {
    return null;
  }

  const instance = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 60_000,
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  });

  instance.on("error", (err) => {
    console.error("[pg] Idle connection dropped (recovered):", err.message);
  });

  return instance;
}

export function getPgPool(): pg.Pool | null {
  if (pool === undefined) {
    pool = buildPool();
  }
  return pool;
}

export function isTransientPgError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /Connection terminated|ECONNRESET|ECONNREFUSED|ETIMEDOUT|timeout expired|Client has encountered a connection error/i.test(
    msg
  );
}
