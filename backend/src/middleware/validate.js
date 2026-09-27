import { badRequest, notFound } from '../errors.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Router param guard: a malformed id can't match any row, so it's a 404, not a DB error. */
export function uuidParam(name, code = 'TRACKING_TARGET_NOT_FOUND', message = 'Tracked product was not found.') {
  return (req, res, next) => (UUID.test(req.params[name]) ? next() : next(notFound(code, message)));
}

export function parseIntParam(value, name, { min = 1, max = Number.MAX_SAFE_INTEGER, fallback } = {}) {
  if (value === undefined || value === '') {
    if (fallback !== undefined) return fallback;
    throw badRequest(`${name} is required.`);
  }
  if (!/^\d+$/.test(String(value))) throw badRequest(`${name} must be a positive integer.`);
  const n = Number(value);
  if (n < min || n > max) throw badRequest(`${name} must be between ${min} and ${max}.`);
  return n;
}

export function parseBoolParam(value, name) {
  if (value === undefined || value === '') return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw badRequest(`${name} must be true or false.`);
}

export function parseIsoParam(value, name) {
  if (value === undefined || value === '') return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw badRequest(`${name} must be an ISO 8601 timestamp.`);
  return d.toISOString();
}
