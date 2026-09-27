'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { formatShort, formatDateTime } from '@/lib/format';

const HEIGHT = 220;
const PAD = { top: 16, right: 16, bottom: 28, left: 64 };

/** Round axis ticks: 1/2/5 × 10^n steps covering [min, max]. */
function niceTicks(min, max, count = 4) {
  if (min === max) {
    const d = Math.abs(min) * 0.1 || 1;
    min -= d;
    max += d;
  }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

/**
 * Single-series time line with a crosshair tooltip (pointer + arrow keys).
 * points: [{ t: ISO string, v: number }] sorted by time. One series per chart: the title names it.
 */
export default function LineChart({ title, description, points, formatValue, formatTick = formatValue, zeroBased = false, step = false }) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState(null); // index of hovered point
  const fillId = `area-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.floor(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!points.length) {
    return (
      <figure ref={wrapRef} className="card rounded-2xl bg-surface p-5 sm:p-6">
        <figcaption className="font-semibold">{title}</figcaption>
        <p className="mt-6 mb-4 text-center text-sm text-muted">No successful observations yet.</p>
      </figure>
    );
  }

  const times = points.map((p) => new Date(p.t).getTime());
  const values = points.map((p) => p.v);
  const tMin = times[0];
  const tMax = times[times.length - 1];
  const yTicks = niceTicks(zeroBased ? 0 : Math.min(...values), Math.max(...values));
  const yMin = yTicks[0];
  const yMax = yTicks[yTicks.length - 1];

  const plotW = width - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (t) => PAD.left + (tMax === tMin ? plotW / 2 : ((t - tMin) / (tMax - tMin)) * plotW);
  const y = (v) => PAD.top + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH;

  let path = '';
  points.forEach((p, i) => {
    const px = x(times[i]);
    const py = y(p.v);
    if (i === 0) path += `M${px},${py}`;
    else if (step) path += `H${px}V${py}`;
    else path += `L${px},${py}`;
  });

  // X ticks: up to ~5 evenly spaced timestamps.
  const xTickCount = Math.min(points.length, Math.max(2, Math.floor(plotW / 140)));
  const xTicks = tMax === tMin ? [tMin] : Array.from({ length: xTickCount }, (_, i) => tMin + ((tMax - tMin) * i) / (xTickCount - 1));

  function nearestIndex(px) {
    let best = 0;
    for (let i = 1; i < times.length; i++) if (Math.abs(x(times[i]) - px) < Math.abs(x(times[best]) - px)) best = i;
    return best;
  }

  function onPointerMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    setActive(nearestIndex(PAD.left + ((e.clientX - rect.left) / rect.width) * plotW));
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const d = e.key === 'ArrowRight' ? 1 : -1;
      setActive((i) => Math.min(points.length - 1, Math.max(0, (i ?? (d > 0 ? -1 : points.length)) + d)));
    } else if (e.key === 'Escape') {
      setActive(null);
    }
  }

  const a = active === null ? null : { px: x(times[active]), py: y(values[active]), p: points[active] };
  const last = points[points.length - 1];
  const tooltipLeft = a ? Math.min(Math.max(a.px, 90), width - 90) : 0;

  return (
    <figure ref={wrapRef} className="card rounded-2xl bg-surface p-5 sm:p-6">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold">{title}</span>
        <span className="text-sm text-ink-2">
          Latest <strong className="tabular font-semibold text-ink">{formatValue(last.v)}</strong>
        </span>
      </figcaption>
      {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}

      <div className="relative mt-3">
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={`${title}: ${points.length} observations from ${formatDateTime(points[0].t)} to ${formatDateTime(last.t)}. Use left and right arrow keys to read values.`}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onBlur={() => setActive(null)}
          className="block touch-none rounded outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--series-1)" stopOpacity="0.14" />
              <stop offset="100%" stopColor="var(--series-1)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--grid)" strokeWidth="1" />
              <text x={PAD.left - 8} y={y(v)} dy="0.32em" textAnchor="end" fontSize="11" fill="var(--muted)" className="tabular">
                {formatTick(v)}
              </text>
            </g>
          ))}
          <line x1={PAD.left} x2={width - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH} stroke="var(--axis)" strokeWidth="1" />
          {xTicks.map((t, i) => (
            <text
              key={t}
              x={x(t)}
              y={HEIGHT - 8}
              fontSize="11"
              fill="var(--muted)"
              textAnchor={xTicks.length === 1 ? 'middle' : i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
            >
              {formatShort(new Date(t).toISOString())}
            </text>
          ))}

          <path d={`${path}V${PAD.top + plotH}H${x(tMin)}Z`} fill={`url(#${fillId})`} />
          <path d={path} fill="none" stroke="var(--series-1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {/* Markers only when sparse enough to read; always on the last point. */}
          {points.length <= 24 &&
            points.map((p, i) => <circle key={p.t} cx={x(times[i])} cy={y(p.v)} r="3" fill="var(--series-1)" />)}
          <circle cx={x(tMax)} cy={y(last.v)} r="4" fill="var(--series-1)" stroke="var(--surface)" strokeWidth="2" />

          {a && (
            <g pointerEvents="none">
              <line x1={a.px} x2={a.px} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--ink-2)" strokeWidth="1" strokeDasharray="3 3" />
              <circle cx={a.px} cy={a.py} r="5" fill="var(--series-1)" stroke="var(--surface)" strokeWidth="2" />
            </g>
          )}

          {/* Hit target: the whole plot, larger than any mark. */}
          <rect
            x={PAD.left}
            y={PAD.top}
            width={plotW}
            height={plotH}
            fill="transparent"
            onPointerMove={onPointerMove}
            onPointerDown={onPointerMove}
            onPointerLeave={() => setActive(null)}
          />
        </svg>

        {a && (
          <div
            role="status"
            className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-lg bg-surface px-3 py-2 text-xs shadow-lg ring-1 ring-line"
            style={{ left: tooltipLeft }}
          >
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="inline-block h-0.5 w-3 rounded" style={{ background: 'var(--series-1)' }} />
              <strong className="tabular text-sm text-ink">{formatValue(a.p.v)}</strong>
            </div>
            <div className="mt-0.5 text-ink-2">{formatDateTime(a.p.t)}</div>
          </div>
        )}
      </div>
    </figure>
  );
}
