import { db, transaction, isUniqueViolation } from './prisma.js';
import { getPool, toIso } from './pool.js';

/**
 * Insert a run; for a duplicate run_key (same cron slot) nothing is inserted and the
 * existing run is returned with duplicate = true.
 */
export async function claimRun({ runKey, triggerSource, targetCount = 0 }) {
  try {
    const run = await db().scrape_runs.create({
      data: { run_key: runKey, trigger_source: triggerSource, target_count: targetCount },
    });
    return { run, duplicate: false };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return { run: await findRunByKey(runKey), duplicate: true };
  }
}

export function findRunByKey(runKey) {
  return db().scrape_runs.findUnique({ where: { run_key: runKey } });
}

export async function setRunTargetCount(runId, targetCount) {
  await db().scrape_runs.update({ where: { id: runId }, data: { target_count: targetCount } });
}

/** Close runs left `running` by a crash/restart (docs/architecture.md §8.1). */
export async function closeStuckRuns(olderThanMs, exceptRunId) {
  const rows = await db().scrape_runs.updateManyAndReturn({
    where: { status: 'running', started_at: { lt: new Date(Date.now() - olderThanMs) }, id: { not: exceptRunId } },
    data: { status: 'failed', finished_at: new Date() },
    select: { run_key: true },
  });
  return rows.map((r) => r.run_key);
}

export async function finishRun(runId, { successCount, failureCount, status }) {
  await db().scrape_runs.update({
    where: { id: runId },
    data: { status, success_count: successCount, failure_count: failureCount, finished_at: new Date() },
  });
}

export async function failRun(runId) {
  await db().scrape_runs.updateMany({
    where: { id: runId, status: 'running' },
    data: { status: 'failed', finished_at: new Date() },
  });
}

/** Success: attempt + observation + current state in one transaction (docs/database.md §10). */
export function recordSuccess({ runId, trackedProductId, attemptNumber, startedAt, finishedAt, result }) {
  return transaction(async (tx) => {
    const attempt = await tx.scrape_attempts.create({
      data: {
        run_id: runId,
        tracked_product_id: trackedProductId,
        attempt_number: attemptNumber,
        started_at: startedAt,
        finished_at: finishedAt,
        duration_ms: finishedAt - startedAt,
        outcome: 'success',
        method: 'browser',
        manifest_revision: result.manifestRevision,
        raw_price_text: result.rawPriceText,
        raw_stock_text: result.rawStockText,
        extracted_price: result.price,
        extracted_stock_qty: result.stockQty,
      },
    });
    await tx.price_observations.create({
      data: {
        tracked_product_id: trackedProductId,
        scrape_attempt_id: attempt.id,
        price: result.price,
        mrp: result.mrp,
        currency: result.currency,
        stock_qty: result.stockQty,
        captured_at: finishedAt,
      },
    });
    await tx.tracked_products.update({
      where: { id: trackedProductId },
      data: {
        current_price: result.price,
        current_mrp: result.mrp,
        currency: result.currency,
        current_stock_qty: result.stockQty,
        last_success_at: finishedAt,
        last_attempt_at: finishedAt,
        last_outcome: 'success',
        consecutive_failures: 0,
        updated_at: new Date(),
      },
    });
    return attempt.id;
  });
}

/**
 * Retried / failed attempt: attempt row only; current price/stock are never touched.
 * A final failure also bumps consecutive_failures.
 */
export function recordFailure({ runId, trackedProductId, attemptNumber, startedAt, finishedAt, outcome, method, error }) {
  return transaction(async (tx) => {
    const attempt = await tx.scrape_attempts.create({
      data: {
        run_id: runId,
        tracked_product_id: trackedProductId,
        attempt_number: attemptNumber,
        started_at: startedAt,
        finished_at: finishedAt,
        duration_ms: finishedAt - startedAt,
        outcome,
        method,
        http_status: error.httpStatus ?? null,
        error_code: error.code,
        error_message: String(error.message).slice(0, 1000),
        manifest_revision: error.manifestRevision ?? null,
        raw_price_text: error.rawPriceText ?? null,
        raw_stock_text: error.rawStockText ?? null,
      },
    });
    await tx.tracked_products.update({
      where: { id: trackedProductId },
      data: {
        last_attempt_at: finishedAt,
        last_outcome: outcome,
        consecutive_failures: { increment: outcome === 'failed' ? 1 : 0 },
        updated_at: new Date(),
      },
    });
    return attempt.id;
  });
}

export async function getRunSummary(runId) {
  const r = await db().scrape_runs.findUnique({
    where: { id: runId },
    include: { _count: { select: { scrape_attempts: true } } },
  });
  if (!r) return null;
  return {
    runId: r.id,
    runKey: r.run_key,
    triggerSource: r.trigger_source,
    status: r.status,
    startedAt: toIso(r.started_at),
    finishedAt: toIso(r.finished_at),
    targets: r.target_count,
    successes: r.success_count,
    failures: r.failure_count,
    attempts: r._count.scrape_attempts,
  };
}

export function getLastCronRun() {
  return db().scrape_runs.findFirst({
    where: { trigger_source: 'cron' },
    orderBy: { started_at: 'desc' },
    select: { started_at: true, status: true },
  });
}

/**
 * Cross-instance guard: a session-level advisory lock held on a dedicated pg client for the
 * whole batch. Stays on raw pg because Prisma can't pin one connection for minutes.
 */
const BATCH_LOCK_KEY = 72_531_001;

export async function tryAcquireBatchLock() {
  const client = await getPool().connect();
  try {
    const { rows } = await client.query('select pg_try_advisory_lock($1) as locked', [BATCH_LOCK_KEY]);
    if (rows[0].locked) {
      return async () => {
        try { await client.query('select pg_advisory_unlock($1)', [BATCH_LOCK_KEY]); } finally { client.release(); }
      };
    }
    client.release();
    return null;
  } catch (error) {
    client.release();
    throw error;
  }
}

/** Every attempt (incl. retried/failed) for the CSV, in pages so memory stays flat. */
export async function* exportAttempts(batchSize = 2000) {
  for (let skip = 0; ; skip += batchSize) {
    const rows = await db().scrape_attempts.findMany({
      include: { tracked_products: { select: { store_product_id: true, product_name: true, selected_option: true } } },
      orderBy: [{ started_at: 'asc' }, { attempt_number: 'asc' }, { id: 'asc' }],
      take: batchSize,
      skip,
    });
    if (rows.length) {
      yield rows.map((r) => ({
        product_id: r.tracked_products.store_product_id,
        product_name: r.tracked_products.product_name,
        selected_option: r.tracked_products.selected_option,
        timestamp: r.started_at,
        price: r.extracted_price === null ? null : r.extracted_price.toFixed(2),
        stock: r.extracted_stock_qty,
        outcome: r.outcome,
      }));
    }
    if (rows.length < batchSize) return;
  }
}
