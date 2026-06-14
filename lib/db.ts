import { Pool, type QueryResultRow } from 'pg';

// Singleton pool — Next.js hot-reloads in dev, so we cache on globalThis
// to avoid exhausting connection limits across module reloads.
const globalForPg = globalThis as unknown as { pgPool: Pool | undefined };

export const pool =
  globalForPg.pgPool ??
  new Pool({
    host:     process.env.POSTGRES_HOST     || 'mps-postgres',
    port:     parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_DB       || 'mps_connect',
    user:     process.env.POSTGRES_USER     || 'mps',
    password: process.env.POSTGRES_PASSWORD || '',
    max:      10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPg.pgPool = pool;
}

/**
 * Execute a parameterised query.
 * Usage: db('SELECT * FROM cases WHERE id = $1', [id])
 */
export async function db<T extends QueryResultRow = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const { rows } = await pool.query<T>(sql, params);
  return rows;
}

/**
 * Execute a query and return the first row only.
 * Returns null if no rows.
 */
export async function dbOne<T extends QueryResultRow = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await db<T>(sql, params);
  return rows[0] ?? null;
}
