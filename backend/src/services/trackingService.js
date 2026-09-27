import * as trackingDb from '../db/tracking.js';
import { mapTracked } from '../db/tracking.js';
import { getProductDetail } from './productService.js';
import { badRequest, conflict, notFound } from '../errors.js';
import { queueInitialScrape } from './scrapeService.js';

/**
 * Track a product option. Name, URL and labels come from the store, never from the client.
 * Returns { status: 201 | 200, tracked }.
 */
export async function trackProduct({ storeProductId, selectedOptionKey }) {
  let product;
  try {
    product = await getProductDetail(storeProductId);
  } catch (error) {
    if (error.status === 404) throw badRequest(`Unknown store product ${storeProductId}.`);
    throw error;
  }
  const option = product.options.find((o) => o.key === selectedOptionKey);
  if (!option) {
    throw badRequest(`Option "${selectedOptionKey}" is not offered for product ${storeProductId}.`, {
      availableOptions: product.options,
    });
  }

  const snapshot = {
    storeProductId: product.storeProductId,
    productName: product.name,
    productUrl: product.url,
    optionAxis: product.optionAxis,
    selectedOption: option.label,
    selectedOptionKey: option.key,
  };

  const existing = await trackingDb.findByTarget(snapshot.storeProductId, snapshot.selectedOptionKey);
  if (existing?.active) throw conflict('ALREADY_TRACKED', 'This product option is already being tracked.');

  let row;
  let status;
  if (existing) {
    row = await trackingDb.reactivateTracked(existing.id, snapshot);
    status = 200;
  } else {
    try {
      row = await trackingDb.insertTracked(snapshot);
    } catch (error) {
      // Lost a race with a concurrent request: the partial unique index caught it.
      if (error.code === '23505') throw conflict('ALREADY_TRACKED', 'This product option is already being tracked.');
      throw error;
    }
    status = 201;
  }

  queueInitialScrape(row.id).catch((e) => console.error('[scrape] initial scrape not queued:', e.message));
  return { status, tracked: mapTracked(row) };
}

export async function listTracked(filters) {
  const { rows, total } = await trackingDb.listTracked(filters);
  return { items: rows.map(mapTracked), total };
}

export async function getTracked(id) {
  const row = await trackingDb.getTracked(id);
  if (!row) throw notFound('TRACKING_TARGET_NOT_FOUND', 'Tracked product was not found.');
  const summary = await trackingDb.getAttemptSummary(id);
  return { ...mapTracked(row), summary };
}

export async function untrack(id) {
  const row = await trackingDb.deactivateTracked(id);
  if (!row) throw notFound('TRACKING_TARGET_NOT_FOUND', 'Tracked product was not found.');
  return row;
}

async function assertExists(id) {
  if (!(await trackingDb.getTracked(id))) throw notFound('TRACKING_TARGET_NOT_FOUND', 'Tracked product was not found.');
}

export async function getHistory(id, opts) {
  await assertExists(id);
  return trackingDb.getHistory(id, opts);
}

export async function getScrapeLogs(id, opts) {
  await assertExists(id);
  return trackingDb.getScrapeLogs(id, opts);
}
