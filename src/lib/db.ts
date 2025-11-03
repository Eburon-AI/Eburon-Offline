import { Pool } from "pg";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://eburon:eburon@localhost:5432/eburon_chat";

const pool = new Pool({
  connectionString,
  max: parseInt(process.env.PGPOOL_MAX ?? "10", 10),
  idleTimeoutMillis: parseInt(process.env.PGPOOL_IDLE_TIMEOUT ?? "30000", 10),
});

export function getPool(): Pool {
  return pool;
}

export async function query<T = unknown>(text: string, params?: unknown[]) {
  const client = await pool.connect();
  try {
    const result = await client.query<T>(text, params);
    return result;
  } finally {
    client.release();
  }
}
