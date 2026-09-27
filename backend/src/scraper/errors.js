// Scrape failures are classified so the retry loop knows what to do (docs/architecture.md §5.5).
export const Kind = Object.freeze({
  TRANSIENT: 'transient', // network, timeouts, 408/429/5xx, challenge never completes
  STRUCTURE: 'structure', // locator miss / manifest changed: retry with fresh page + manifest
  PERMANENT: 'permanent', // product 404, option gone, name mismatch: fail immediately
});

export class ScrapeError extends Error {
  constructor(code, message, { kind = Kind.TRANSIENT, httpStatus = null, rawPriceText = null, rawStockText = null } = {}) {
    super(message);
    this.code = code;
    this.kind = kind;
    this.httpStatus = httpStatus;
    this.rawPriceText = rawPriceText;
    this.rawStockText = rawStockText;
  }
}
