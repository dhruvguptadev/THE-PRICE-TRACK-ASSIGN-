import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateExtraction } from '../src/scraper/validate.js';
import { Kind } from '../src/scraper/errors.js';

const target = { productName: 'Halvard Filing Cabinet Aero', selectedOption: 'Walnut' };
const good = {
  pageName: 'Halvard Filing Cabinet Aero',
  activeOption: 'Walnut',
  priceText: '₹​33,523',
  priceVisible: true,
  pricePending: false,
  priceIsDecoy: false,
  mrpText: '₹40,882',
  stockText: 'Available (27)',
  stockSoldOut: false,
};

test('valid extraction', () => {
  const r = validateExtraction(good, target);
  assert.equal(r.price, 33523);
  assert.equal(r.mrp, 40882);
  assert.equal(r.currency, 'INR');
  assert.equal(r.stockQty, 27);
});

test('sold out is a valid success with stock 0', () => {
  assert.equal(validateExtraction({ ...good, stockText: 'Sold out', stockSoldOut: true }, target).stockQty, 0);
});

test('garbled MRP is dropped, not fatal', () => {
  assert.equal(validateExtraction({ ...good, mrpText: '—' }, target).mrp, null);
});

const failures = [
  ['name mismatch is permanent', { pageName: 'Other Product' }, 'NAME_MISMATCH', Kind.PERMANENT],
  ['wrong active option', { activeOption: 'Oak' }, 'OPTION_NOT_ACTIVE', Kind.TRANSIENT],
  ['pending (dimmed) price', { pricePending: true }, 'PRICE_NOT_READY', Kind.TRANSIENT],
  ['invisible price', { priceVisible: false }, 'PRICE_NOT_READY', Kind.TRANSIENT],
  ['decoy element', { priceIsDecoy: true }, 'VALIDATION_FAILED', Kind.TRANSIENT],
  ['zero price', { priceText: '₹0' }, 'VALIDATION_FAILED', Kind.TRANSIENT],
  ['unparseable price', { priceText: 'Price locked' }, 'VALIDATION_FAILED', Kind.TRANSIENT],
  ['unparseable stock', { stockText: 'In stock' }, 'VALIDATION_FAILED', Kind.TRANSIENT],
];

for (const [name, patch, code, kind] of failures) {
  test(`rejects: ${name}`, () => {
    assert.throws(() => validateExtraction({ ...good, ...patch }, target), (e) => {
      assert.equal(e.code, code);
      assert.equal(e.kind, kind);
      return true;
    });
  });
}
