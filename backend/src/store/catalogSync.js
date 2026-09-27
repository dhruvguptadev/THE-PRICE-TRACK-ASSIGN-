import { getListingsPage, LISTING_PAGE_LIMIT } from './storeClient.js';
import { sleep } from '../scraper/retry.js';

/**
 * Collects the full catalog despite the listing API returning a different random order
 * on every request (docs/architecture.md §3.1): repeat full passes, dedupe by id, stop
 * once unique ids == reported count or the pass limit is hit.
 */
// Pause between listing requests: back-to-back passes (~100 requests) got the store to answer 429.
export async function collectCatalog({ maxPasses = 15, fetchPage = getListingsPage, pageDelayMs = 250, log = () => {} } = {}) {
  const byId = new Map();
  let count = null;
  let passes = 0;
  let fetched = 0;

  while (passes < maxPasses && (count === null || byId.size < count)) {
    passes++;
    const first = await fetchPage(1, LISTING_PAGE_LIMIT);
    count = first.count;
    const totalPages = first.totalPages;
    const pages = [first];
    for (let page = 2; page <= totalPages; page++) {
      await sleep(pageDelayMs);
      pages.push(await fetchPage(page, LISTING_PAGE_LIMIT));
    }
    for (const { results = [] } of pages) {
      for (const item of results) {
        fetched++;
        if (Number.isInteger(item.id) && !byId.has(item.id)) byId.set(item.id, item);
      }
    }
    log(`catalog pass ${passes}: ${byId.size}/${count} unique`);
  }

  return {
    products: [...byId.values()],
    count,
    fetched,
    passes,
    complete: count !== null && byId.size >= count,
  };
}
