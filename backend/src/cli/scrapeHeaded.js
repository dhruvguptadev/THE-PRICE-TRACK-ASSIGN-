// Local headed scraper run for the demo recording (Render has no display).
//
//   npm run scrape:headed -- --tracked-product-id <uuid>     one target
//   npm run scrape:headed                                    all active targets
//   npm run scrape:headed -- --simulate-timeout              DEMO AID: forces attempt 1 to time
//                                                            out so the retry path is visible
//   npm run scrape:headed -- --slow-mo 250 --headless
//
// Uses the same scraper and persistence as production; rows are written with trigger_source = demo.
import { parseArgs } from 'node:util';
import { closePool } from '../db/pool.js';
import * as trackingDb from '../db/tracking.js';
import { runDemo } from '../services/scrapeService.js';

const { values } = parseArgs({
  options: {
    'tracked-product-id': { type: 'string' },
    'simulate-timeout': { type: 'boolean', default: false },
    'slow-mo': { type: 'string', default: '150' },
    headless: { type: 'boolean', default: false },
  },
});

try {
  const id = values['tracked-product-id'];
  const targets = id ? [await trackingDb.getTracked(id)].filter(Boolean) : await trackingDb.listActiveTargets();
  if (!targets.length) {
    console.error(id ? `No tracked product with id ${id}` : 'No active tracked products.');
    process.exitCode = 1;
  } else {
    if (values['simulate-timeout']) console.log('⚠ --simulate-timeout: attempt 1 uses a 1 ms price-ready timeout (demo aid, not a real store failure)');
    const summary = await runDemo(targets, {
      headed: !values.headless,
      slowMo: Number(values['slow-mo']) || 0,
      simulateTimeout: values['simulate-timeout'],
      log: (m) => console.log(m),
    });
    console.log('\nRun summary:', summary);
  }
} finally {
  await closePool();
}
