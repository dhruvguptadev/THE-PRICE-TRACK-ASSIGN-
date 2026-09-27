import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { requestId } from './middleware/requestId.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { healthRouter } from './routes/health.routes.js';
import { productsRouter } from './routes/products.routes.js';
import { catalogRouter } from './routes/catalog.routes.js';
import { trackingRouter } from './routes/tracking.routes.js';
import { scrapeRouter } from './routes/scrape.routes.js';
import { exportRouter } from './routes/export.routes.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // behind Render's proxy

  // FRONTEND_ORIGIN may list several origins, comma-separated (e.g. Vercel URL + localhost).
  const origins = config.frontendOrigin.split(',').map((o) => o.trim()).filter(Boolean);
  app.use(cors({ origin: origins, exposedHeaders: ['X-Request-Id', 'Content-Disposition'] }));
  app.use(requestId);
  app.use(express.json({ limit: '16kb' }));

  app.get('/', (req, res) => res.json({ data: { service: 'price-tracker-api', docs: '/api/health' } }));

  const api = express.Router();
  api.use(healthRouter, productsRouter, catalogRouter, trackingRouter, scrapeRouter, exportRouter);
  app.use('/api', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
