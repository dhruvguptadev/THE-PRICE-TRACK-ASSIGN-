import pg from 'pg';
import { config } from '../config.js';

// Shared pg.Pool: Prisma's driver adapter runs on it, and the session-level batch advisory
// lock needs a dedicated client from it (Prisma can't pin a connection for minutes).
let pool = null;

export function getPool() {
  if (!config.databaseUrl) throw new Error('DATABASE_URL is not configured');
  if (!pool) {
    const local = /@(localhost|127\.0\.0\.1)(:|\/)/.test(config.databaseUrl);
    pool = new pg.Pool({
      connectionString: config.databaseUrl,
      // Supabase pooler requires TLS; its cert chain isn't in Node's default store.
      ssl: local ? false : { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      options: '-c TimeZone=UTC',
    });
    // Prisma's pg adapter drops the offset of timestamptz values when the session isn't UTC
    // (reads came back shifted by +05:30 on an IST server), so pin every connection to UTC.
    pool.on('error', (err) => console.error('[db] idle client error:', err));
  }
  return pool;
}

/** Raw SQL for things outside Prisma's model API (schema bootstrap). */
export const query = (text, params) => getPool().query(text, params);

export async function closePool() {
  const { disconnectPrisma } = await import('./prisma.js');
  await disconnectPrisma();
  if (pool) await pool.end().catch(() => {});
  pool = null;
}

// Prisma returns numeric columns as Decimal; the API speaks plain numbers.
export const toNumber = (v) => (v === null || v === undefined ? null : Number(v));
export const toIso = (v) => (v ? new Date(v).toISOString() : null);
