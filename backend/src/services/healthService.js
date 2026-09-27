import { config } from '../config.js';
import { toIso } from '../db/pool.js';
import { db } from '../db/prisma.js';
import { getLastCronRun } from '../db/runs.js';
import { catalogStatus } from './catalogService.js';

export async function getHealth() {
  const health = {
    status: 'ok',
    service: 'price-tracker-api',
    db: 'ok',
    catalog: null,
    scheduler: null,
    timestamp: new Date().toISOString(),
  };
  try {
    await db().$queryRaw`select 1`;
    const [catalog, lastCron] = await Promise.all([catalogStatus(), getLastCronRun()]);
    health.catalog = catalog;
    const lastAt = lastCron ? new Date(lastCron.started_at) : null;
    health.scheduler = {
      lastCronRunAt: toIso(lastAt),
      lastCronRunStatus: lastCron?.status ?? null,
      // Never run, or no run for > 2 h 30 min: the scheduler has stopped (never silently stop).
      schedulerStale: !lastAt || Date.now() - lastAt.getTime() > config.schedulerStaleMs,
    };
  } catch (error) {
    health.status = 'degraded';
    health.db = 'error';
    console.error('[health] db check failed:', error.message);
  }
  return health;
}
