import { Router } from 'express';
import { requireSecret } from '../middleware/requireSecret.js';
import { syncCatalog } from '../services/catalogService.js';

export const catalogRouter = Router();

catalogRouter.post('/catalog/sync', requireSecret, async (req, res) => {
  res.json({ data: await syncCatalog() });
});
