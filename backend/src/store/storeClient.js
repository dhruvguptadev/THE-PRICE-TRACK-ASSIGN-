import { fetchJson } from './httpClient.js';

export const LISTING_PAGE_LIMIT = 60; // the store caps `limit` at 60

export function getListingsPage(page, limit = LISTING_PAGE_LIMIT, opts) {
  return fetchJson(`/api/v2/listings?page=${page}&limit=${limit}`, opts);
}

/** Product detail with options (no price/stock; those need the browser). */
export function getItem(storeProductId, opts) {
  return fetchJson(`/api/v2/items/${encodeURIComponent(storeProductId)}`, opts);
}

/** Current obfuscated class names for the product page. They rotate per revision. */
export function getManifest(opts) {
  return fetchJson('/api/v2/ui/manifest', opts);
}
