'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import LineChart from '@/components/LineChart';
import ScrapeLog from '@/components/ScrapeLog';
import StatusBadge from '@/components/StatusBadge';
import { api } from '@/lib/api';
import { formatDateTime, formatPrice, formatStock, timeAgo } from '@/lib/format';

export default function TrackedProductPage({ params }) {
  const { id } = use(params);
  const [state, setState] = useState({ status: 'loading' });
  const [view, setView] = useState('chart');

  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [product, history, logs] = await Promise.all([api.getTracked(id), api.history(id), api.logs(id)]);
        if (!cancelled) setState({ status: 'done', product: product.data, history: history.data.items, logs: logs.data.items });
      } catch (error) {
        if (!cancelled) setState({ status: error.status === 404 ? 'missing' : 'error', message: error.message });
      }
    })();
    const timer = setTimeout(() => setRefresh((n) => n + 1), 60_000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [id, refresh]);

  if (state.status === 'loading') return <p className="text-sm text-muted">Loading…</p>;
  if (state.status === 'missing') {
    return (
      <div className="space-y-3">
        <p className="font-medium">This tracked product doesn’t exist.</p>
        <Link href="/dashboard" className="text-sm text-accent hover:underline">← Back to dashboard</Link>
      </div>
    );
  }
  if (state.status === 'error') {
    return <p role="alert" className="rounded-xl bg-critical/10 p-4 text-sm text-critical-ink ring-1 ring-critical/30">{state.message}</p>;
  }

  const { product: p, history, logs } = state;
  const lastFailed = p.lastOutcome === 'failed';
  const priceFmt = (v) => formatPrice(v, p.currency);
  const compactPrice = (v) => (v >= 1e5 ? `₹${(v / 1e5).toFixed(v % 1e5 ? 1 : 0)}L` : v >= 1e3 ? `₹${(v / 1e3).toFixed(v % 1e3 ? 1 : 0)}k` : `₹${v}`);

  return (
    <div className="space-y-8">
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-accent">← All tracked products</Link>

      <header className="card overflow-hidden rounded-2xl bg-surface">
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">{p.productName}</h1>
              <p className="mt-1.5 text-sm text-ink-2">
                {p.optionAxis}: <strong className="text-ink">{p.selectedOption}</strong> · Product #{p.storeProductId}
                {!p.active && <span className="ml-2 rounded bg-surface-2 px-1.5 py-0.5 text-xs">Not tracked anymore</span>}
              </p>
            </div>
            <a href={p.productUrl} target="_blank" rel="noreferrer" className="rounded-lg bg-surface px-3 py-1.5 text-sm font-medium shadow-sm ring-1 ring-line transition-colors hover:bg-surface-2">View on store ↗</a>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-4">
          <Stat label="Current price" value={formatPrice(p.currentPrice, p.currency)} sub={p.currentMrp ? `MRP ${formatPrice(p.currentMrp, p.currency)}` : null} />
          <Stat label="Stock" value={formatStock(p.stockQty)} />
          <Stat label="Last successful check" value={timeAgo(p.lastSuccessAt)} sub={formatDateTime(p.lastSuccessAt)} />
          <div className="bg-surface px-5 py-4 sm:px-6">
            <dt className="text-xs text-muted">Last attempt</dt>
            <dd className="mt-1.5"><StatusBadge outcome={p.lastOutcome ?? 'pending'} /></dd>
            <dd className="mt-1 text-xs text-muted">
              {p.summary.successes}/{p.summary.attempts} attempts succeeded
              {p.consecutiveFailures > 0 && <> · {p.consecutiveFailures} failed in a row</>}
            </dd>
          </div>
        </dl>

        {lastFailed && p.currentPrice !== null && (
          <p className="m-5 rounded-lg bg-warning/15 px-3 py-2 text-sm text-warning-ink ring-1 ring-inset ring-warning/40">
            <span aria-hidden="true">! </span>The latest check failed. The price shown is the last verified value from {formatDateTime(p.lastSuccessAt)}.
          </p>
        )}
      </header>

      <section aria-labelledby="history-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="history-heading" className="text-xl font-semibold">History</h2>
          <div role="tablist" aria-label="History view" className="inline-flex rounded-full bg-surface-2 p-1 ring-1 ring-line">
            {['chart', 'table'].map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={`rounded-full px-3.5 py-1 text-sm capitalize transition-colors ${view === v ? 'bg-surface font-medium text-ink shadow-sm ring-1 ring-line' : 'text-ink-2 hover:text-ink'}`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {view === 'chart' ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <LineChart
              title="Price"
              description="Main displayed price for this option (validated checks only)"
              points={history.map((h) => ({ t: h.capturedAt, v: h.price }))}
              formatValue={priceFmt}
              formatTick={compactPrice}
            />
            <LineChart
              title="Units in stock"
              description="0 means sold out"
              points={history.map((h) => ({ t: h.capturedAt, v: h.stockQty }))}
              formatValue={(v) => v.toLocaleString('en-IN')}
              zeroBased
              step
            />
          </div>
        ) : (
          <HistoryTable history={history} currency={p.currency} />
        )}
      </section>

      <section aria-labelledby="log-heading" className="space-y-4">
        <div>
          <h2 id="log-heading" className="text-xl font-semibold">Scrape log</h2>
          <p className="mt-1 text-sm text-ink-2">
            Every attempt is listed. <em>Retried</em> means that attempt failed and another followed; <em>Failed</em> means the final attempt failed, so no price was recorded.
          </p>
        </div>
        <ScrapeLog items={logs} currency={p.currency} />
      </section>
    </div>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className="bg-surface px-5 py-4 sm:px-6">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="tabular mt-1 text-xl font-semibold tracking-tight">{value}</dd>
      {sub && <dd className="text-xs text-muted">{sub}</dd>}
    </div>
  );
}

function HistoryTable({ history, currency }) {
  if (!history.length) return <p className="card rounded-2xl bg-surface p-6 text-center text-sm text-muted">No successful observations yet.</p>;
  return (
    <div className="card relative overflow-x-auto rounded-2xl bg-surface">
      <table className="w-full min-w-[480px] text-sm">
        <thead className="border-b border-line bg-surface-2/60 text-left text-xs text-muted">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">Captured</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Price</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">MRP</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Stock</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {[...history].reverse().map((h) => (
            <tr key={h.capturedAt}>
              <td className="px-4 py-2.5">{formatDateTime(h.capturedAt)}</td>
              <td className="tabular px-4 py-2.5 text-right font-medium">{formatPrice(h.price, currency)}</td>
              <td className="tabular px-4 py-2.5 text-right text-ink-2">{formatPrice(h.mrp, currency)}</td>
              <td className="tabular px-4 py-2.5 text-right">{formatStock(h.stockQty)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
