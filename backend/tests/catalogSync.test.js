import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectCatalog } from '../src/store/catalogSync.js';

// Fake store: `count` products served in a fresh random order on every page request,
// so one pass over all pages misses some ids (like the real store).
function shuffledStore(count, perPage = 60, seed = 1) {
  const ids = Array.from({ length: count }, (_, i) => 1000 + i);
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return async (page, limit) => {
    const shuffled = [...ids].sort(() => rand() - 0.5);
    const start = (page - 1) * limit;
    return {
      page, perPage: limit, count, totalPages: Math.ceil(count / limit),
      results: shuffled.slice(start, start + limit).map((id) => ({ id, slug: `p-${id}`, name: `Product ${id}` })),
    };
  };
}

test('repeated passes collect every product despite shuffled pages', async () => {
  const r = await collectCatalog({ fetchPage: shuffledStore(300), maxPasses: 20, pageDelayMs: 0 });
  assert.equal(r.products.length, 300);
  assert.equal(new Set(r.products.map((p) => p.id)).size, 300);
  assert.ok(r.complete);
  assert.ok(r.passes > 1, 'a single pass should not be enough');
});

test('reports incompleteness instead of hiding it', async () => {
  const r = await collectCatalog({ fetchPage: shuffledStore(300), maxPasses: 1, pageDelayMs: 0 });
  assert.equal(r.passes, 1);
  assert.equal(r.complete, false);
  assert.ok(r.products.length < 300);
});
