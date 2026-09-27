// npm run db:schema: applies backend/db/schema.sql to DATABASE_URL (idempotent).
import { readFile } from 'node:fs/promises';
import { query, closePool } from '../db/pool.js';

const sql = await readFile(new URL('../../db/schema.sql', import.meta.url), 'utf8');
try {
  await query(sql);
  console.log('schema applied');
} finally {
  await closePool();
}
