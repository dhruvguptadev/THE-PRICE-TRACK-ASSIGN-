import { ScrapeError, Kind } from './errors.js';

/** Maps any thrown value to a ScrapeError with a retry classification. */
export function classify(error) {
  if (error instanceof ScrapeError) return error;

  const message = String(error?.message || error);
  const name = error?.name || '';

  if (name === 'TimeoutError' || /timeout|timed out/i.test(message)) {
    return new ScrapeError('TIMEOUT', firstLine(message), { kind: Kind.TRANSIENT });
  }
  if (/net::|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket hang up|fetch failed|Target closed|has been closed/i.test(message)) {
    return new ScrapeError('NETWORK_ERROR', firstLine(message), { kind: Kind.TRANSIENT });
  }
  return new ScrapeError('UNEXPECTED_ERROR', firstLine(message), { kind: Kind.TRANSIENT });
}

/** HTTP status → classified error for store API calls. */
export function classifyHttpStatus(status, url) {
  if (status === 404) return new ScrapeError('PRODUCT_NOT_FOUND', `404 from ${url}`, { kind: Kind.PERMANENT, httpStatus: status });
  if (status === 429) return new ScrapeError('RATE_LIMITED', `429 from ${url}`, { kind: Kind.TRANSIENT, httpStatus: status });
  if (status === 408) return new ScrapeError('TIMEOUT', `408 from ${url}`, { kind: Kind.TRANSIENT, httpStatus: status });
  if (status >= 500) return new ScrapeError('UPSTREAM_5XX', `${status} from ${url}`, { kind: Kind.TRANSIENT, httpStatus: status });
  return new ScrapeError('UPSTREAM_ERROR', `${status} from ${url}`, { kind: Kind.PERMANENT, httpStatus: status });
}

export const isRetryable = (error) => error.kind !== Kind.PERMANENT;

function firstLine(text) {
  return text.split('\n')[0].slice(0, 500);
}
