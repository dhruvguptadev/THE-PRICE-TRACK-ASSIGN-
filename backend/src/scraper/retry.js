/** Exponential backoff with full jitter: base * 2^(attempt-1), randomized to [50%, 100%]. */
export function backoffDelay(attempt, baseMs, random = Math.random) {
  const ceiling = baseMs * 2 ** (attempt - 1);
  return Math.round(ceiling / 2 + random() * (ceiling / 2));
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
