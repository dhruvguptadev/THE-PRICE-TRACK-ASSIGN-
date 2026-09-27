import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvField, csvRow, CSV_HEADER } from '../src/services/exportService.js';
import { cronRunKey } from '../src/services/scrapeService.js';

test('CSV header matches the brief', () => {
  assert.equal(CSV_HEADER.join(','), 'product_id,product_name,selected_option,timestamp,price,stock,outcome');
});

test('CSV escaping', () => {
  assert.equal(csvField('plain'), 'plain');
  assert.equal(csvField('a, b'), '"a, b"');
  assert.equal(csvField('say "hi"'), '"say ""hi"""');
  assert.equal(csvField(null), '');
});

test('success row carries price/stock; failed row is blank', () => {
  const base = { product_id: 2765, product_name: 'Halvard Filing Cabinet Aero', selected_option: 'Oak', timestamp: new Date('2026-09-25T10:00:24Z') };
  assert.equal(csvRow({ ...base, price: '12999.00', stock: 7, outcome: 'success' }),
    '2765,Halvard Filing Cabinet Aero,Oak,2026-09-25T10:00:24.000Z,12999.00,7,success');
  assert.equal(csvRow({ ...base, price: null, stock: null, outcome: 'retried' }),
    '2765,Halvard Filing Cabinet Aero,Oak,2026-09-25T10:00:24.000Z,,,retried');
  assert.equal(csvRow({ ...base, stock: 0, price: '5.00', outcome: 'success' }).split(',')[5], '0');
});

test('cron run key is the 2-hour UTC slot', () => {
  assert.equal(cronRunKey(new Date('2026-09-25T10:00:01Z')), 'cron-2026-09-25T10');
  assert.equal(cronRunKey(new Date('2026-09-25T11:59:59Z')), 'cron-2026-09-25T10');
  assert.equal(cronRunKey(new Date('2026-09-25T00:30:00Z')), 'cron-2026-09-25T00');
  assert.equal(cronRunKey(new Date('2026-09-25T23:00:00Z')), 'cron-2026-09-25T22');
});
