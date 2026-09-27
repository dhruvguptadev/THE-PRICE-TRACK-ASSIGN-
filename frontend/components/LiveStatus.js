'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';

// One-line live readout for the landing page. Fetched client-side so a Render cold start
// never delays the page itself.
export default function LiveStatus() {
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const slow = setTimeout(() => !cancelled && setState((s) => (s.status === 'loading' ? { status: 'waking' } : s)), 3000);
    const load = async (attempt = 1) => {
      try {
        const [health, tracked] = await Promise.all([api.health(), api.listTracked()]);
        if (!cancelled) setState({ status: 'ok', health: health.data, tracked: tracked.meta?.total ?? tracked.data.items.length });
      } catch {
        if (cancelled) return;
        if (attempt < 4) setTimeout(() => load(attempt + 1), 10_000);
        else setState({ status: 'down' });
      }
    };
    load();
    return () => { cancelled = true; clearTimeout(slow); };
  }, []);

  if (state.status === 'loading' || state.status === 'waking') {
    return (
      <Shell tone="idle">
        {state.status === 'waking' ? 'Waking the backend (free hosting sleeps when idle)…' : 'Checking the backend…'}
      </Shell>
    );
  }
  if (state.status === 'down') return <Shell tone="down">Backend unreachable right now</Shell>;

  const { health, tracked } = state;
  const last = health.scheduler?.lastCronRunAt;
  const stale = health.scheduler?.schedulerStale;
  return (
    <Shell tone={stale ? 'stale' : 'live'}>
      <span className="font-medium text-ink">{stale ? 'Scheduler idle' : 'Live'}</span>
      <Sep />
      <span className="tabular">{tracked}</span>&nbsp;{tracked === 1 ? 'option' : 'options'} tracked
      <Sep />
      {last ? <>last scheduled run {timeAgo(last)}</> : 'no scheduled run yet'}
      {health.catalog?.count ? (
        <span className="hidden sm:inline">
          <Sep />
          <span className="tabular">{health.catalog.count}</span> products searchable
        </span>
      ) : null}
    </Shell>
  );
}

const DOT = {
  idle: 'bg-muted',
  live: 'bg-good',
  stale: 'bg-warning',
  down: 'bg-critical',
};

function Shell({ tone, children }) {
  return (
    <p role="status" className="inline-flex flex-wrap items-center gap-y-1 rounded-lg bg-surface px-3.5 sm:rounded-full py-1.5 text-xs text-ink-2 ring-1 ring-line">
      <span className="relative mr-2 flex h-2 w-2" aria-hidden="true">
        {tone === 'live' && <span className="absolute inline-flex h-full w-full rounded-full bg-good opacity-60 motion-safe:animate-ping" />}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${DOT[tone]}`} />
      </span>
      {children}
    </p>
  );
}

const Sep = () => <span aria-hidden="true" className="mx-2 text-muted">·</span>;
