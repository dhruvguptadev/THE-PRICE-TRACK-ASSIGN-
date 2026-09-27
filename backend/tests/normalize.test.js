import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePrice, parseStock, sameText } from '../src/scraper/normalize.js';

test('parsePrice: zero-width/NBSP split price from the live store', () => {
  // Exact text captured from <output> on /item/2036.
  const raw = '₹​ ​​​3​ ​​​5​ ​​​,​ ​​​0​ ​​​9​ ​​​0';
  assert.deepEqual(parsePrice(raw), { amount: 35090, currency: 'INR' });
});

test('parsePrice: Indian digit grouping with decimals', () => {
  assert.deepEqual(parsePrice('₹1,29,999.00'), { amount: 129999, currency: 'INR' });
  assert.deepEqual(parsePrice('₹ 12,999.50'), { amount: 12999.5, currency: 'INR' });
  assert.deepEqual(parsePrice('999'), { amount: 999, currency: null });
});

test('parsePrice: fullwidth and native-script digits (seen live on Render, 26 Sep)', () => {
  assert.deepEqual(parsePrice('₹３６,５５６'), { amount: 36556, currency: 'INR' });
  assert.deepEqual(parsePrice('₹\u200B３\u200B０,３１６'), { amount: 30316, currency: 'INR' });
  assert.deepEqual(parsePrice('₹１,２９,９９９．００'), { amount: 129999, currency: 'INR' });
  assert.deepEqual(parsePrice('₹२३,९३२'), { amount: 23932, currency: 'INR' });
  assert.equal(parseStock('Available (１５１)'), 151);
  assert.equal(parsePrice('₹３６,５５６ ₹４０,０００'), null);
});

test('parsePrice: rejects anything that is not exactly one amount', () => {
  for (const bad of ['', null, 'Price locked', '₹', '₹12,999 ₹15,999', '12.345', '-500', 'Hold on — checking availability…']) {
    assert.equal(parsePrice(bad), null, `should reject ${JSON.stringify(bad)}`);
  }
});

test('parseStock: all five store wordings', () => {
  assert.equal(parseStock('7 units available'), 7);
  assert.equal(parseStock('Last few: 7'), 7);
  assert.equal(parseStock('Available (27)'), 27);
  assert.equal(parseStock('AVAILABLE (197)'), 197);
  assert.equal(parseStock('Stock: 7 remaining'), 7);
  assert.equal(parseStock('Ready to ship · 7 available'), 7);
});

test('parseStock: sold out → 0; ambiguous or empty → null', () => {
  assert.equal(parseStock('Sold out'), 0);
  assert.equal(parseStock('SOLD OUT'), 0);
  assert.equal(parseStock(''), null);
  assert.equal(parseStock('In stock'), null);
  assert.equal(parseStock('3 of 7 left'), null);
});

test('sameText ignores case, spacing and invisible characters', () => {
  assert.ok(sameText('Halvard Filing​ Cabinet  Aero', 'halvard filing cabinet aero'));
  assert.ok(!sameText('Oak', 'Walnut'));
  assert.ok(!sameText('', ''));
});
