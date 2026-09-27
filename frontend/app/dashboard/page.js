'use client';

import { useEffect, useState } from 'react';
import HealthBanner from '@/components/HealthBanner';
import LiveStatus from '@/components/LiveStatus';
import ProductSearch from '@/components/ProductSearch';
import TrackedTable from '@/components/TrackedTable';
import { api, exportCsvUrl } from '@/lib/api';
import { timeAgo } from '@/lib/format';

// Refresh faster while any target is waiting for its first scrape.
const FAST_POLL_MS = 10_000;
const SLOW_POLL_MS = 60_000;

export default function Dashboard() {
  const [tracked, setTracked] = useState({ status: 'loading', items: [] });
  const [busyId, setBusyId] = useState(null);

  const [refresh, setRefresh] = useState(0);
  const load = () => setRefresh((n) => n + 1);

  const pending = tracked.items.some((t) => !t.lastAttemptAt);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.listTracked();
        if (!cancelled) setTracked({ status: 'done', items: data.items });
      } catch (error) {
        if (!cancelled) setTracked((t) => ({ ...t, status: 'error', message: error.message }));
      }
    })();
    return () => { cancelled = true; };
  }, [refresh]);

  // Poll faster while any target is still waiting for its first scrape.
  useEffect(() => {
    const timer = setInterval(load, pending ? FAST_POLL_MS : SLOW_POLL_MS);
    return () => clearInterval(timer);
  }, [pending]);

  async function untrack(t) {
    if (!window.confirm(`Stop tracking ${t.productName} (${t.selectedOption})? Its history is kept and stays in the CSV export.`)) return;
    setBusyId(t.id);
    try {
      await api.untrack(t.id);
      load();
    } catch (error) {
      window.alert(error.message);
    } finally {
      setBusyId(null);
    }
  }

  const items = tracked.items;
  const inStock = items.filter((t) => t.stockQty > 0).length;
  const failing = items.filter((t) => t.consecutiveFailures >= 3).length;
  const lastAttempt = items.reduce((latest, t) => (t.lastAttemptAt && (!latest || t.lastAttemptAt > latest) ? t.lastAttemptAt : latest), null);

  const stats = [
    ['Options tracked', items.length],
    ['In stock', `${inStock} / ${items.length}`],
    ['Failing repeatedly', failing, failing > 0 ? 'text-critical-ink' : ''],
    ['Last check', timeAgo(lastAttempt)],
  ];

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">Dashboard</h1>
          <p className="mt-1.5 text-sm text-ink-2">Price and stock for every tracked option, checked every 2 hours.</p>
        </div>
        <LiveStatus />
      </header>

      <HealthBanner />

      {tracked.status === 'done' && items.length > 0 && (
        <dl className="card grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-line lg:grid-cols-4">
          {stats.map(([label, value, tone = '']) => (
            <div key={label} className="bg-surface px-5 py-5">
              <dt className="text-sm text-muted">{label}</dt>
              <dd className={`tabular mt-1.5 text-2xl font-semibold tracking-tight ${tone}`}>{value}</dd>
            </div>
          ))}
        </dl>
      )}

      <ProductSearch onTracked={load} />

      <section aria-labelledby="tracked-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="tracked-heading" className="text-xl font-semibold">Tracked products</h2>
            <p className="mt-1 text-sm text-ink-2">Open a product for its full price history and every scrape attempt.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={load} className="rounded-lg bg-surface px-3.5 py-2 text-sm font-medium shadow-sm ring-1 ring-line transition-colors hover:bg-surface-2">
              ↻ Refresh
            </button>
            <a href={exportCsvUrl} className="rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-accent-ink shadow-sm shadow-accent/25 transition-colors hover:bg-accent-strong" download>
              ↓ Export CSV
            </a>
          </div>
        </div>

        {tracked.status === 'loading' && <p className="card rounded-2xl bg-surface p-6 text-sm text-muted">Loading tracked products…</p>}
        {tracked.status === 'error' && (
          <p role="alert" className="rounded-2xl bg-critical/10 p-4 text-sm text-critical-ink ring-1 ring-critical/30">
            Could not load tracked products: {tracked.message}
          </p>
        )}
        {tracked.status !== 'loading' && tracked.status !== 'error' && <TrackedTable items={items} onUntrack={untrack} busyId={busyId} />}
        {pending && <p className="text-xs text-muted">A first price check is running; this list refreshes automatically.</p>}
      </section>
    </div>
  );
}
