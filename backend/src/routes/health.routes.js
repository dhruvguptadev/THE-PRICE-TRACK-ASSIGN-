import { Router } from 'express';
import { getHealth } from '../services/healthService.js';

export const healthRouter = Router();

healthRouter.get('/health', async (req, res) => {
  const health = await getHealth();
  res.status(health.db === 'ok' ? 200 : 503).json({ data: health });
});
