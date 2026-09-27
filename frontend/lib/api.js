// Thin fetch wrapper for the Express API (NEXT_PUBLIC_API_BASE_URL is inlined at build time).
const BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000/api').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request(path, { method = 'GET', body, signal } = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      signal,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the API. It may be waking up; try again in a moment.');
  }
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const e = payload?.error;
    throw new ApiError(res.status, e?.code ?? 'HTTP_ERROR', e?.message ?? `Request failed (${res.status})`, e?.details);
  }
  return payload;
}

export const api = {
  health: (opts) => request('/health', opts),
  search: (q, opts) => request(`/products/search?q=${encodeURIComponent(q)}&limit=10`, opts),
  product: (storeProductId, opts) => request(`/products/${storeProductId}`, opts),
  listTracked: (opts) => request('/tracked-products?active=true&limit=100', opts),
  getTracked: (id, opts) => request(`/tracked-products/${id}`, opts),
  track: (storeProductId, selectedOptionKey) =>
    request('/tracked-products', { method: 'POST', body: { storeProductId, selectedOptionKey } }),
  untrack: (id) => request(`/tracked-products/${id}`, { method: 'DELETE' }),
  history: (id, opts) => request(`/tracked-products/${id}/history`, opts),
  logs: (id, opts) => request(`/tracked-products/${id}/scrape-logs?limit=200`, opts),
};

export const exportCsvUrl = `${BASE}/export.csv`;
