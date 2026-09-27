import { config } from '../config.js';
import { classify, classifyHttpStatus, isRetryable } from '../scraper/classify.js';
import { backoffDelay, sleep } from '../scraper/retry.js';

/**
 * GET JSON from the store with a timeout and bounded retries on 408/429/5xx/network errors.
 * Throws a classified ScrapeError on final failure.
 */
export async function fetchJson(path, { retries = 3, timeoutMs = config.httpTimeoutMs, fetchImpl = fetch } = {}) {
  const url = `${config.storeBaseUrl}${path}`;
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetchImpl(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw classifyHttpStatus(res.status, path);
      return await res.json();
    } catch (error) {
      lastError = classify(error);
      if (!isRetryable(lastError) || attempt === retries) break;
      await sleep(backoffDelay(attempt, 500));
    }
  }
  throw lastError;
}
