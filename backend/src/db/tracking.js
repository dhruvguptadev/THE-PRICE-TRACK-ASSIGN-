import { db } from './prisma.js';
import { toNumber, toIso } from './pool.js';

export function mapTracked(r) {
  return {
    id: r.id,
    storeProductId: r.store_product_id,
    productName: r.product_name,
    productUrl: r.product_url,
    optionAxis: r.option_axis,
    selectedOption: r.selected_option,
    selectedOptionKey: r.selected_option_key,
    active: r.active,
    currentPrice: toNumber(r.current_price),
    currentMrp: toNumber(r.current_mrp),
    currency: r.currency,
    stockQty: r.current_stock_qty,
    stockStatus: r.current_stock_qty === null ? null : r.current_stock_qty > 0 ? 'in_stock' : 'out_of_stock',
    lastSuccessAt: toIso(r.last_success_at),
    lastAttemptAt: toIso(r.last_attempt_at),
    lastOutcome: r.last_outcome,
    consecutiveFailures: r.consecutive_failures,
    createdAt: toIso(r.created_at),
    updatedAt: toIso(r.updated_at),
  };
}

export function findByTarget(storeProductId, optionKey) {
  // Prefer the active row; otherwise the most recently updated inactive one (to reactivate).
  return db().tracked_products.findFirst({
    where: { store_product_id: storeProductId, selected_option_key: optionKey },
    orderBy: [{ active: 'desc' }, { updated_at: 'desc' }],
  });
}

export function insertTracked(t) {
  return db().tracked_products.create({
    data: {
      store_product_id: t.storeProductId,
      product_name: t.productName,
      product_url: t.productUrl,
      option_axis: t.optionAxis,
      selected_option: t.selectedOption,
      selected_option_key: t.selectedOptionKey,
    },
  });
}

/** Reactivate a soft-deleted target, refreshing its name/label snapshot from the store. */
export function reactivateTracked(id, t) {
  return db().tracked_products.update({
    where: { id },
    data: {
      active: true,
      product_name: t.productName,
      product_url: t.productUrl,
      option_axis: t.optionAxis,
      selected_option: t.selectedOption,
      updated_at: new Date(),
    },
  });
}

export async function listTracked({ active, limit, offset }) {
  const where = active === undefined ? {} : { active };
  const [rows, total] = await Promise.all([
    db().tracked_products.findMany({ where, orderBy: { created_at: 'asc' }, take: limit, skip: offset }),
    db().tracked_products.count({ where }),
  ]);
  return { rows, total };
}

export function listActiveTargets() {
  return db().tracked_products.findMany({ where: { active: true }, orderBy: { created_at: 'asc' } });
}

export function getTracked(id) {
  return db().tracked_products.findUnique({ where: { id } });
}

export async function getAttemptSummary(id) {
  const groups = await db().scrape_attempts.groupBy({
    by: ['outcome'],
    where: { tracked_product_id: id },
    _count: { _all: true },
  });
  const count = (outcome) => groups.find((g) => g.outcome === outcome)?._count._all ?? 0;
  return {
    attempts: groups.reduce((sum, g) => sum + g._count._all, 0),
    successes: count('success'),
    retries: count('retried'),
    failures: count('failed'),
  };
}

export async function deactivateTracked(id) {
  const { count } = await db().tracked_products.updateMany({
    where: { id },
    data: { active: false, updated_at: new Date() },
  });
  return count ? { id, active: false } : null;
}

export async function getHistory(id, { from, to, limit }) {
  const rows = await db().price_observations.findMany({
    where: {
      tracked_product_id: id,
      captured_at: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) },
    },
    orderBy: { captured_at: 'asc' },
    take: limit,
  });
  return rows.map((r) => ({
    capturedAt: toIso(r.captured_at),
    price: toNumber(r.price),
    mrp: toNumber(r.mrp),
    currency: r.currency,
    stockQty: r.stock_qty,
  }));
}

export async function getScrapeLogs(id, { limit, offset }) {
  const rows = await db().scrape_attempts.findMany({
    where: { tracked_product_id: id },
    include: { scrape_runs: { select: { run_key: true, trigger_source: true } } },
    orderBy: [{ started_at: 'desc' }, { attempt_number: 'desc' }],
    take: limit,
    skip: offset,
  });
  return rows.map((r) => ({
    id: r.id,
    runId: r.run_id,
    runKey: r.scrape_runs.run_key,
    triggerSource: r.scrape_runs.trigger_source,
    attemptNumber: r.attempt_number,
    startedAt: toIso(r.started_at),
    finishedAt: toIso(r.finished_at),
    durationMs: r.duration_ms,
    outcome: r.outcome,
    method: r.method,
    httpStatus: r.http_status,
    price: toNumber(r.extracted_price),
    stockQty: r.extracted_stock_qty,
    errorCode: r.error_code,
    errorMessage: r.error_message,
    manifestRevision: r.manifest_revision,
    rawPriceText: r.raw_price_text,
    rawStockText: r.raw_stock_text,
  }));
}
