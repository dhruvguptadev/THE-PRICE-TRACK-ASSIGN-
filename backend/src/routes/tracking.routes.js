import { Router } from 'express';
import { badRequest } from '../errors.js';
import { parseBoolParam, parseIntParam, parseIsoParam, uuidParam } from '../middleware/validate.js';
import * as tracking from '../services/trackingService.js';

export const trackingRouter = Router();
const validId = uuidParam('id');

trackingRouter.post('/tracked-products', async (req, res) => {
  const body = req.body ?? {};
  if (!Number.isInteger(body.storeProductId) || body.storeProductId < 1) {
    throw badRequest('storeProductId must be a positive integer.');
  }
  if (typeof body.selectedOptionKey !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(body.selectedOptionKey)) {
    throw badRequest('selectedOptionKey must be a store option id such as "o1".');
  }
  const { status, tracked } = await tracking.trackProduct(body);
  res.status(status).json({ data: tracked });
});

trackingRouter.get('/tracked-products', async (req, res) => {
  const active = parseBoolParam(req.query.active, 'active');
  const limit = parseIntParam(req.query.limit, 'limit', { max: 100, fallback: 25 });
  const offset = parseIntParam(req.query.offset, 'offset', { min: 0, fallback: 0 });
  const { items, total } = await tracking.listTracked({ active, limit, offset });
  res.json({ data: { items }, meta: { limit, offset, total } });
});

trackingRouter.get('/tracked-products/:id', validId, async (req, res) => {
  res.json({ data: await tracking.getTracked(req.params.id) });
});

trackingRouter.delete('/tracked-products/:id', validId, async (req, res) => {
  res.json({ data: await tracking.untrack(req.params.id) });
});

trackingRouter.get('/tracked-products/:id/history', validId, async (req, res) => {
  const items = await tracking.getHistory(req.params.id, {
    from: parseIsoParam(req.query.from, 'from'),
    to: parseIsoParam(req.query.to, 'to'),
    limit: parseIntParam(req.query.limit, 'limit', { max: 5000, fallback: 1000 }),
  });
  res.json({ data: { items } });
});

trackingRouter.get('/tracked-products/:id/scrape-logs', validId, async (req, res) => {
  const limit = parseIntParam(req.query.limit, 'limit', { max: 500, fallback: 100 });
  const offset = parseIntParam(req.query.offset, 'offset', { min: 0, fallback: 0 });
  const items = await tracking.getScrapeLogs(req.params.id, { limit, offset });
  res.json({ data: { items }, meta: { limit, offset } });
});
