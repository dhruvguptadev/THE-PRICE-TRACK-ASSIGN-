import { Router } from 'express';
import { requireSecret } from '../middleware/requireSecret.js';
import { uuidParam } from '../middleware/validate.js';
import { triggerScheduledRun, triggerManualRun, getRun } from '../services/scrapeService.js';

export const scrapeRouter = Router();

// Scheduler: 202 + background batch (cron-job.org times out after ~30 s); 200 for a duplicate slot.
scrapeRouter.post('/scrape/run', requireSecret, async (req, res) => {
  const { httpStatus, body } = await triggerScheduledRun();
  res.status(httpStatus).json({ data: body });
});

scrapeRouter.post('/scrape/:trackedProductId', requireSecret, uuidParam('trackedProductId'), async (req, res) => {
  res.status(202).json({ data: await triggerManualRun(req.params.trackedProductId) });
});

scrapeRouter.get('/runs/:runId', uuidParam('runId', 'RUN_NOT_FOUND', 'Scrape run was not found.'), async (req, res) => {
  res.json({ data: await getRun(req.params.runId) });
});
