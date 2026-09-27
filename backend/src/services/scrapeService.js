import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { conflict, notFound } from '../errors.js';
import * as runsDb from '../db/runs.js';
import * as trackingDb from '../db/tracking.js';
import { mapTracked } from '../db/tracking.js';
import { getItem, getManifest } from '../store/storeClient.js';
import { launchBrowser } from '../scraper/browser.js';
import { scrapePrice } from '../scraper/priceScraper.js';
import { classify, isRetryable } from '../scraper/classify.js';
import { ScrapeError, Kind } from '../scraper/errors.js';
import { backoffDelay, sleep } from '../scraper/retry.js';

/** `cron-2026-09-25T10`: trigger source + 2-hour UTC slot. */
export function cronRunKey(now = new Date()) {
  const slotHour = Math.floor(now.getUTCHours() / 2) * 2;
  return `cron-${now.toISOString().slice(0, 10)}T${String(slotHour).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Serial job queue: one Chromium at a time on Render's 512 MB, and a target is never
// scraped by two overlapping runs in this instance.
// ---------------------------------------------------------------------------
let queue = Promise.resolve();
let pendingJobs = 0;
let cronBatchActive = false;

function enqueue(job) {
  pendingJobs++;
  const run = queue.then(job).finally(() => { pendingJobs--; });
  queue = run.catch(() => {});
  return run;
}

export const scrapeQueueDepth = () => pendingJobs;

/** Resolves once no scrape job is in flight, or `maxMs` elapses — whichever comes first. */
export async function waitForQueueDrain(maxMs) {
  const start = Date.now();
  while (pendingJobs > 0 && Date.now() - start < maxMs) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

/** POST /api/scrape/run. Returns immediately; the batch runs in the background. */
export async function triggerScheduledRun() {
  const runKey = cronRunKey();
  if (cronBatchActive) {
    // Same slot → harmless duplicate (200). A different slot while a batch still runs → 409.
    const existing = await runsDb.findRunByKey(runKey);
    if (existing) return { httpStatus: 200, body: { runKey, status: existing.status, duplicate: true } };
    throw conflict('BATCH_RUNNING', 'A scheduled batch is already running.');
  }
  const targets = await trackingDb.listActiveTargets();
  const { run, duplicate } = await runsDb.claimRun({ runKey, triggerSource: 'cron', targetCount: targets.length });
  if (duplicate) return { httpStatus: 200, body: { runKey, status: run.status, duplicate: true } };

  cronBatchActive = true;
  enqueue(() => processRun(run, { loadTargets: true })).finally(() => { cronBatchActive = false; })
    .catch((e) => console.error(`[scrape] run ${runKey} crashed:`, e));
  return { httpStatus: 202, body: { runId: run.id, runKey, status: 'running', targets: targets.length } };
}

/** POST /api/scrape/:trackedProductId. */
export async function triggerManualRun(trackedProductId) {
  const row = await trackingDb.getTracked(trackedProductId);
  if (!row) throw notFound('TRACKING_TARGET_NOT_FOUND', 'Tracked product was not found.');
  const { run } = await runsDb.claimRun({ runKey: `manual-${randomUUID()}`, triggerSource: 'manual', targetCount: 1 });
  enqueue(() => processRun(run, { targets: [row] })).catch((e) => console.error('[scrape] manual run crashed:', e));
  return { runId: run.id, runKey: run.run_key, status: 'running', targets: 1 };
}

/** Background scrape right after a target is created or reactivated. */
export async function queueInitialScrape(trackedProductId) {
  const row = await trackingDb.getTracked(trackedProductId);
  const { run } = await runsDb.claimRun({ runKey: `initial-${randomUUID()}`, triggerSource: 'initial', targetCount: 1 });
  enqueue(() => processRun(run, { targets: [row] })).catch((e) => console.error('[scrape] initial run crashed:', e));
  return run;
}

/** Headed demo run from the CLI; awaits completion. */
export async function runDemo(trackedRows, options) {
  const { run } = await runsDb.claimRun({ runKey: `demo-${randomUUID()}`, triggerSource: 'demo', targetCount: trackedRows.length });
  return enqueue(() => processRun(run, { targets: trackedRows, ...options }));
}

export async function getRun(runId) {
  const run = await runsDb.getRunSummary(runId);
  if (!run) throw notFound('RUN_NOT_FOUND', 'Scrape run was not found.');
  return run;
}

// ---------------------------------------------------------------------------
// Batch execution
// ---------------------------------------------------------------------------

/**
 * Scrape every target of a run sequentially. One target's failure never aborts the batch,
 * and the browser is always closed.
 *
 * options: { targets | loadTargets, headed, slowMo, simulateTimeout, log }
 */
export async function processRun(run, options = {}) {
  const log = options.log ?? ((m) => console.log(`[scrape ${run.run_key}] ${m}`));

  const closed = await runsDb.closeStuckRuns(config.stuckRunMs, run.id).catch(() => []);
  if (closed.length) log(`closed stuck runs as failed: ${closed.join(', ')}`);

  const release = await runsDb.tryAcquireBatchLock();
  if (!release) {
    log('another instance holds the batch lock; marking run failed');
    await runsDb.failRun(run.id);
    return getRun(run.id);
  }

  let successCount = 0;
  let failureCount = 0;
  let browser = null;
  try {
    // Re-read targets when the job starts: a target deactivated while queued is skipped.
    const targets = options.loadTargets
      ? await trackingDb.listActiveTargets()
      : (await Promise.all(options.targets.map((t) => trackingDb.getTracked(t.id)))).filter(Boolean);
    await runsDb.setRunTargetCount(run.id, targets.length);
    log(`${targets.length} target(s)`);

    const fallbackManifest = await getManifest().catch(() => null);
    const shared = { fallbackManifest };

    for (const row of targets) {
      const target = mapTracked(row);
      try {
        if (!browser || !browser.isConnected()) {
          browser = await launchBrowser({ headed: options.headed, slowMo: options.slowMo });
        }
        const ok = await scrapeTargetWithRetries(browser, target, run, shared, options, log);
        ok ? successCount++ : failureCount++;
      } catch (error) {
        // Only reached if persistence itself failed; keep going with the next target.
        failureCount++;
        log(`target ${target.id} aborted: ${error.message}`);
      }
    }

    const status = failureCount === 0 ? 'completed' : successCount === 0 ? 'failed' : 'partial';
    await runsDb.finishRun(run.id, { successCount, failureCount, status });
    log(`finished: ${status} (${successCount} ok, ${failureCount} failed)`);
  } catch (error) {
    log(`run failed: ${error.message}`);
    await runsDb.finishRun(run.id, { successCount, failureCount, status: 'failed' }).catch(() => {});
  } finally {
    if (browser) await browser.close().catch(() => {});
    await release().catch(() => {});
  }
  return getRun(run.id);
}

/**
 * Up to SCRAPE_MAX_ATTEMPTS attempts; every attempt is persisted.
 * `retried` = failed and another attempt follows; `failed` = final attempt failed.
 */
async function scrapeTargetWithRetries(browser, target, run, shared, options, log) {
  const maxAttempts = config.scrapeMaxAttempts;
  let productVerified = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const startedAt = new Date();
    let method = 'browser';
    try {
      // Cheap HTTP check first so a vanished product/option fails as permanent, not as a page timeout.
      if (!productVerified) {
        method = 'http';
        await verifyTargetStillOffered(target);
        productVerified = true;
        method = 'browser';
      }

      const simulate = options.simulateTimeout && attempt === 1;
      const result = await scrapePrice(browser, target, {
        fallbackManifest: shared.fallbackManifest,
        priceReadyTimeoutMs: simulate ? 1 : config.priceReadyTimeoutMs,
        log: (m) => log(`  [${target.productName} / ${target.selectedOption}] #${attempt} ${m}`),
      }).catch((error) => {
        if (simulate && error.code === 'CHALLENGE_TIMEOUT') {
          error.message = `[demo --simulate-timeout] ${error.message}`;
        }
        throw error;
      });

      await runsDb.recordSuccess({
        runId: run.id, trackedProductId: target.id, attemptNumber: attempt,
        startedAt, finishedAt: new Date(), result,
      });
      log(`  ✓ ${target.productName} / ${target.selectedOption}: ${result.currency} ${result.price}, stock ${result.stockQty}`);
      return true;
    } catch (thrown) {
      const error = classify(thrown);
      if (thrown?.manifestRevision !== undefined) error.manifestRevision = thrown.manifestRevision;
      const final = !isRetryable(error) || attempt === maxAttempts;
      // A structure miss that persists across every attempt is reported as STRUCTURE_CHANGED.
      if (final && error.kind === Kind.STRUCTURE) error.code = 'STRUCTURE_CHANGED';
      const outcome = final ? 'failed' : 'retried';

      await runsDb.recordFailure({
        runId: run.id, trackedProductId: target.id, attemptNumber: attempt,
        startedAt, finishedAt: new Date(), outcome, method, error,
      });
      log(`  ✗ ${target.productName} / ${target.selectedOption} attempt ${attempt} ${outcome}: ${error.code} ${error.message}`);
      if (final) return false;

      if (error.kind === Kind.STRUCTURE) {
        shared.fallbackManifest = await getManifest().catch(() => shared.fallbackManifest);
      }
      await sleep(backoffDelay(attempt, config.retryBaseDelayMs));
    }
  }
  return false;
}

async function verifyTargetStillOffered(target) {
  const item = await getItem(target.storeProductId);
  const offered = (item.options ?? []).some((o) => o.id === target.selectedOptionKey);
  if (!offered) {
    throw new ScrapeError('OPTION_NOT_FOUND', `Option ${target.selectedOptionKey} (${target.selectedOption}) is no longer offered`, { kind: Kind.PERMANENT });
  }
}
