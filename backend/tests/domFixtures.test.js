// Runs the real DOM-reading code against saved snapshots of the store's product page.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { readOffer } from '../src/scraper/priceScraper.js';
import { validateExtraction } from '../src/scraper/validate.js';

const fixture = (name) => readFile(new URL(`../../fixtures/${name}`, import.meta.url), 'utf8');
const manifest = JSON.parse(await fixture('manifest-632003.json'));
const priceSelector = `${manifest.priceTag}.${manifest.classes.priceValue}`;
const target = { productName: 'Halvard Filing Cabinet Aero', selectedOption: 'Walnut' };

let browser;
let page;
before(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
});
after(() => browser?.close());

async function read(name) {
  await page.setContent(await fixture(name));
  return readOffer(page, { priceSelector, classes: manifest.classes });
}

test('reads the visible price, never the hidden decoys (₹20,748 / ₹25,193)', async () => {
  const raw = await read('product-dom-split.html');
  assert.equal(raw.priceIsDecoy, false);
  const r = validateExtraction(raw, target);
  assert.equal(r.price, 33523);
  assert.equal(r.mrp, 40882);
  assert.equal(r.stockQty, 27);
});

test('sold out → stock 0', async () => {
  assert.equal(validateExtraction(await read('product-dom-sold-out.html'), target).stockQty, 0);
});

test('pending (dimmed) price is rejected', async () => {
  const raw = await read('product-dom-pending.html');
  assert.equal(raw.pricePending, true);
  assert.throws(() => validateExtraction(raw, target), { code: 'PRICE_NOT_READY' });
});

test('rotated class names (stale manifest) → STRUCTURE_CHANGED, not a guess', async () => {
  await page.setContent(await fixture('product-dom-split.html'));
  await assert.rejects(
    readOffer(page, { priceSelector: 'output.rotated-xx', classes: manifest.classes }),
    { code: 'STRUCTURE_CHANGED' },
  );
});
