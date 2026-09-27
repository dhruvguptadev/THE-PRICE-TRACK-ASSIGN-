import { collectCatalog } from '../store/catalogSync.js';
import { getListingsPage } from '../store/storeClient.js';
import * as catalogDb from '../db/catalog.js';
import { productUrl } from '../config.js';

let syncInFlight = null;
let storeCount = { value: null, at: 0 };
const STORE_COUNT_TTL_MS = 10 * 60 * 1000;

/** Full catalog refresh; concurrent callers share the same in-flight sync. */
export function syncCatalog() {
  if (!syncInFlight) {
    syncInFlight = (async () => {
      const result = await collectCatalog({ log: (m) => console.log(`[catalog] ${m}`) });
      await catalogDb.upsertCatalog(result.products);
      storeCount = { value: result.count, at: Date.now() };
      const count = await catalogDb.countCatalog();
      return { count, fetched: result.fetched, complete: result.complete, passes: result.passes };
    })().finally(() => { syncInFlight = null; });
  }
  return syncInFlight;
}

/** On startup: sync in the background only when the catalog table is empty. */
export async function ensureCatalog() {
  if ((await catalogDb.countCatalog()) > 0) return;
  console.log('[catalog] empty, syncing in background');
  syncCatalog()
    .then((r) => console.log(`[catalog] synced ${r.count} products (complete=${r.complete}, passes=${r.passes})`))
    .catch((e) => console.error('[catalog] initial sync failed:', e.message));
}

/** Local count vs the store's reported count (cached; the store call is cheap but not free). */
export async function catalogStatus() {
  const count = await catalogDb.countCatalog();
  if (storeCount.value === null || Date.now() - storeCount.at > STORE_COUNT_TTL_MS) {
    try {
      const page = await getListingsPage(1, 1, { retries: 1, timeoutMs: 5_000 });
      storeCount = { value: page.count, at: Date.now() };
    } catch {
      // Store unreachable: report what we know.
    }
  }
  return { count, storeCount: storeCount.value, complete: storeCount.value === null ? null : count >= storeCount.value };
}

export async function searchProducts(q, limit) {
  const rows = await catalogDb.searchCatalog(q, limit);
  return rows.map((r) => ({
    storeProductId: r.store_product_id,
    name: r.name,
    brand: r.brand,
    category: r.category,
    url: productUrl(r.store_product_id),
  }));
}
