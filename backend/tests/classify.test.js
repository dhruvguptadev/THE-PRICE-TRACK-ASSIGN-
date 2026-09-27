import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, classifyHttpStatus, isRetryable } from '../src/scraper/classify.js';
import { backoffDelay } from '../src/scraper/retry.js';
import { ScrapeError, Kind } from '../src/scraper/errors.js';

test('HTTP statuses', () => {
  assert.equal(classifyHttpStatus(404, '/x').code, 'PRODUCT_NOT_FOUND');
  assert.ok(!isRetryable(classifyHttpStatus(404, '/x')));
  assert.equal(classifyHttpStatus(429, '/x').code, 'RATE_LIMITED');
  assert.ok(isRetryable(classifyHttpStatus(429, '/x')));
  assert.equal(classifyHttpStatus(503, '/x').code, 'UPSTREAM_5XX');
  assert.ok(isRetryable(classifyHttpStatus(503, '/x')));
  assert.ok(isRetryable(classifyHttpStatus(408, '/x')));
});

test('thrown errors', () => {
  const timeout = Object.assign(new Error('page.goto: Timeout 30000ms exceeded.\nCall log: ...'), { name: 'TimeoutError' });
  const c = classify(timeout);
  assert.equal(c.code, 'TIMEOUT');
  assert.equal(c.message, 'page.goto: Timeout 30000ms exceeded.');
  assert.equal(classify(new Error('net::ERR_CONNECTION_RESET')).code, 'NETWORK_ERROR');
  assert.equal(classify(new TypeError('fetch failed')).code, 'NETWORK_ERROR');
  assert.equal(classify(new Error('boom')).kind, Kind.TRANSIENT);
});

test('ScrapeErrors pass through unchanged', () => {
  const e = new ScrapeError('OPTION_NOT_FOUND', 'gone', { kind: Kind.PERMANENT });
  assert.equal(classify(e), e);
  assert.ok(!isRetryable(e));
  assert.ok(isRetryable(new ScrapeError('STRUCTURE_CHANGED', 'x', { kind: Kind.STRUCTURE })));
});

test('backoff is exponential with bounded jitter', () => {
  assert.equal(backoffDelay(1, 2000, () => 0), 1000);
  assert.equal(backoffDelay(1, 2000, () => 1), 2000);
  assert.equal(backoffDelay(2, 2000, () => 1), 4000);
  assert.equal(backoffDelay(3, 2000, () => 0.5), 6000);
});
