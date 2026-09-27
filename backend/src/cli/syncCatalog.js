// npm run catalog:sync: refreshes catalog_products from the store listings.
import { syncCatalog } from '../services/catalogService.js';
import { closePool } from '../db/pool.js';

try {
  console.log(await syncCatalog());
} finally {
  await closePool();
}
