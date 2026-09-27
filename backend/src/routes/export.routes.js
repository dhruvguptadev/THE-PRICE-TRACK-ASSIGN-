import { Router } from 'express';
import { writeCsv } from '../services/exportService.js';

export const exportRouter = Router();

exportRouter.get('/export.csv', async (req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="scrape-history.csv"');
  res.setHeader('Cache-Control', 'no-store');
  await writeCsv(res);
});
