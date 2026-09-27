'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';

// Shows backend state: cold start ("waking"), unreachable, stale scheduler, incomplete catalog.
export default function HealthBanner() {
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    // Render's free tier cold-starts in ~50 s; say so instead of looking broken.
    const slow = setTimeout(() => !cancelled && setState((s) => (s.status === 'loading' ? { status: 'waking' } : s)), 3000);
    const load = async (attempt = 1) => {
      try {
        const { data } = await api.health();
        if (!cancelled) setState({ status: 'ok', health: data });
      } catch {
        if (cancelled) return;
        if (attempt < 4) setTimeout(() => load(attempt + 1), 10_000);
        else setState({ status: 'down' });
      }
    };
    load();
    return () => { cancelled = true; clearTimeout(slow); };
  }, []);

  if (state.status === 'loading') return null;
  if (state.status === 'waking') {
    return <Banner tone="info" icon="◌">Waking the backend (free hosting sleeps when idle; this can take up to a minute)…</Banner>;
  }
  if (state.status === 'down') {
    return <Banner tone="critical" icon="✕">The API is unreachable. Data below may not load.</Banner>;
  }

  const { health } = state;
  const notes = [];
  if (health.db !== 'ok') {
    notes.push(<Banner key="db" tone="critical" icon="✕">Database check failed. Tracking data may be unavailable.</Banner>);
  }
  if (health.scheduler?.schedulerStale) {
    const last = health.scheduler.lastCronRunAt;
    notes.push(
      <Banner key="sched" tone="warning" icon="!">
        Scheduled scraping looks stalled: {last ? <>the last scheduled run started {timeAgo(last)}</> : 'no scheduled run has happened yet'} (runs are expected every 2 hours).
      </Banner>,
    );
  }
  if (health.catalog && health.catalog.complete === false) {
    notes.push(
      <Banner key="cat" tone="warning" icon="!">
        Product catalog is incomplete ({health.catalog.count}/{health.catalog.storeCount}); some products may not appear in search yet.
      </Banner>,
    );
  }
  return notes.length ? <div className="space-y-2">{notes}</div> : null;
}

function Banner({ tone, icon, children }) {
  const tones = {
    info: 'bg-surface-2 text-ink-2 ring-line',
    warning: 'bg-warning/15 text-warning-ink ring-warning/40',
    critical: 'bg-critical/10 text-critical-ink ring-critical/30',
  };
  return (
    <div role={tone === 'info' ? 'status' : 'alert'} className={`flex items-start gap-2 rounded-lg px-4 py-3 text-sm ring-1 ring-inset ${tones[tone]}`}>
      <span aria-hidden="true" className="font-bold">{icon}</span>
      <p>{children}</p>
    </div>
  );
}
