import { getItem } from '../store/storeClient.js';
import { ApiError, notFound } from '../errors.js';
import { productUrl } from '../config.js';

/** Live product detail + options from the store's JSON API. */
export async function getProductDetail(storeProductId) {
  let item;
  try {
    item = await getItem(storeProductId, { retries: 2 });
  } catch (error) {
    if (error.code === 'PRODUCT_NOT_FOUND') throw notFound('PRODUCT_NOT_FOUND', `Store product ${storeProductId} was not found.`);
    throw new ApiError(502, 'STORE_UNAVAILABLE', 'The store did not respond; try again shortly.', { reason: error.code });
  }
  return {
    storeProductId: item.id,
    name: item.name,
    brand: item.brand ?? null,
    category: item.category ?? null,
    sku: item.sku ?? null,
    url: productUrl(item.id),
    optionAxis: item.optionAxis ?? null,
    options: (item.options ?? []).map((o) => ({ key: o.id, label: o.label })),
    specs: item.specs ?? {},
  };
}
