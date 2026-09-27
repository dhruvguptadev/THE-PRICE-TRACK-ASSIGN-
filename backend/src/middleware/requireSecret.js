import { createHash, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';
import { ApiError } from '../errors.js';

const digest = (s) => createHash('sha256').update(s).digest();

/** Bearer-secret guard for scheduler/manual scrape/catalog sync (constant-time compare). */
export function requireSecret(req, res, next) {
  if (!config.scrapeTriggerSecret) {
    return next(new ApiError(503, 'SECRET_NOT_CONFIGURED', 'Protected endpoints are disabled: SCRAPE_TRIGGER_SECRET is not set.'));
  }
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  // Hashing first makes both buffers the same length, so timingSafeEqual never throws or leaks length.
  if (!token || !timingSafeEqual(digest(token), digest(config.scrapeTriggerSecret))) {
    return next(new ApiError(401, 'UNAUTHORIZED', 'Missing or invalid bearer secret.'));
  }
  next();
}
