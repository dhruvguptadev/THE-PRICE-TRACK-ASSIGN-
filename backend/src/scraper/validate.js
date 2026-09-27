import { ScrapeError, Kind } from './errors.js';
import { parsePrice, parseStock, sameText } from './normalize.js';

/**
 * Validates a raw DOM reading against the tracked target (docs/architecture.md §5.6).
 * Returns the structured result or throws a ScrapeError. Fail closed: anything
 * unexpected is an error, never a guessed value.
 *
 * raw = { pageName, activeOption, priceText, priceVisible, pricePending, priceIsDecoy,
 *         mrpText, stockText, stockSoldOut }
 */
export function validateExtraction(raw, target) {
  const diag = { rawPriceText: raw.priceText ?? null, rawStockText: raw.stockText ?? null };

  if (!sameText(raw.pageName, target.productName)) {
    throw new ScrapeError('NAME_MISMATCH', `Page shows "${raw.pageName}", expected "${target.productName}"`, { kind: Kind.PERMANENT, ...diag });
  }
  if (!sameText(raw.activeOption, target.selectedOption)) {
    throw new ScrapeError('OPTION_NOT_ACTIVE', `Active option is "${raw.activeOption}", expected "${target.selectedOption}"`, diag);
  }
  if (raw.priceIsDecoy) {
    throw new ScrapeError('VALIDATION_FAILED', 'Price was read from a hidden decoy element', diag);
  }
  if (!raw.priceVisible || raw.pricePending) {
    throw new ScrapeError('PRICE_NOT_READY', 'Price element is not visible or still pending', diag);
  }

  const price = parsePrice(raw.priceText);
  if (!price || !(price.amount > 0)) {
    throw new ScrapeError('VALIDATION_FAILED', `Unparseable price text "${raw.priceText}"`, diag);
  }

  let mrp = null;
  if (raw.mrpText) {
    const parsed = parsePrice(raw.mrpText);
    // MRP is extra info; a garbled MRP must not fail the scrape, but also must not be stored.
    if (parsed && parsed.amount > 0) mrp = parsed.amount;
  }

  const stockQty = raw.stockSoldOut ? 0 : parseStock(raw.stockText);
  if (stockQty === null || !Number.isInteger(stockQty) || stockQty < 0) {
    throw new ScrapeError('VALIDATION_FAILED', `Unparseable stock text "${raw.stockText}"`, diag);
  }

  return {
    price: price.amount,
    mrp,
    currency: price.currency || 'INR',
    stockQty,
    ...diag,
  };
}
