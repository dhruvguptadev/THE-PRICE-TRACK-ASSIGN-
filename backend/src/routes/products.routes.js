import { Router } from 'express';
import { badRequest } from '../errors.js';
import { parseIntParam } from '../middleware/validate.js';
import { searchProducts, catalogStatus } from '../services/catalogService.js';
import { getProductDetail } from '../services/productService.js';

export const productsRouter = Router();

productsRouter.get('/products/search', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (q.length < 1 || q.length > 100) throw badRequest('q must be 1–100 characters.');
  const limit = parseIntParam(req.query.limit, 'limit', { min: 1, max: 25, fallback: 10 });
  const [items, catalog] = await Promise.all([searchProducts(q, limit), catalogStatus()]);
  res.json({ data: { items }, meta: { catalogComplete: catalog.complete, catalogCount: catalog.count } });
});

productsRouter.get('/products/:storeProductId', async (req, res) => {
  const id = parseIntParam(req.params.storeProductId, 'storeProductId', { max: 2_147_483_647 });
  res.json({ data: await getProductDetail(id) });
});
