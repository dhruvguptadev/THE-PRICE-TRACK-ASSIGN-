import 'dotenv/config';

const int = (name, fallback) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) throw new Error(`Env ${name} must be an integer, got "${raw}"`);
  return n;
};

export const config = {
  port: int('PORT', 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || '',
  scrapeTriggerSecret: process.env.SCRAPE_TRIGGER_SECRET || '',
  storeBaseUrl: (process.env.TARGET_STORE_BASE_URL || 'https://demo.inelabteamdev.com').replace(/\/+$/, ''),
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:3001',
  httpTimeoutMs: int('HTTP_TIMEOUT_MS', 15_000),
  browserNavTimeoutMs: int('BROWSER_NAV_TIMEOUT_MS', 30_000),
  priceReadyTimeoutMs: int('PRICE_READY_TIMEOUT_MS', 20_000),
  scrapeMaxAttempts: int('SCRAPE_MAX_ATTEMPTS', 3),
  retryBaseDelayMs: int('RETRY_BASE_DELAY_MS', 2_000),
  // A cron run older than this means the scheduler has stopped firing (docs/architecture.md §8.1).
  schedulerStaleMs: 150 * 60 * 1000,
  // Runs left `running` longer than this are closed as `failed` by the next run.
  stuckRunMs: 30 * 60 * 1000,
  // On SIGTERM/SIGINT, how long to wait for an in-flight scrape batch to finish before
  // closing the DB pool anyway (a deploy mid-scrape used to close the pool immediately,
  // crashing the batch with "Cannot use a pool after calling end on the pool").
  shutdownDrainMs: int('SHUTDOWN_DRAIN_MS', 45_000),
};

export const productUrl = (storeProductId) => `${config.storeBaseUrl}/item/${storeProductId}`;
