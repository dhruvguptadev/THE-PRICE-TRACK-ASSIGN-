'use client';

import Link from 'next/link';
import StatusBadge from './StatusBadge';
import { formatPrice, formatStock, formatDateTime, timeAgo } from '@/lib/format';

const FAILURE_HIGHLIGHT = 3;

export default function TrackedTable({ items, onUntrack, busyId }) {
  if (!items.length) {
    return (
      <div className="card rounded-2xl bg-surface p-10 text-center">
        <p className="font-medium">No products tracked yet</p>
        <p className="mt-1 text-sm text-ink-2">Search above and pick an option to start tracking its price and stock every 2 hours.</p>
      </div>
    );
  }

  return (
    <div className="card relative overflow-x-auto rounded-2xl bg-surface">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="border-b border-line bg-surface-2/60 text-left text-xs text-muted">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">Product / option</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Price</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Stock</th>
            <th scope="col" className="px-4 py-3 font-medium">Last success</th>
            <th scope="col" className="px-4 py-3 font-medium">Last attempt</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Failures in a row</th>
            <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {items.map((t) => {
            const failing = t.consecutiveFailures >= FAILURE_HIGHLIGHT;
            return (
              <tr key={t.id} className={`transition-colors ${failing ? 'bg-critical/5' : 'hover:bg-surface-2/50'}`}>
                <td className="px-4 py-3.5">
                  <Link href={`/products/${t.id}`} className="font-medium text-ink hover:text-accent">{t.productName} <span aria-hidden="true" className="text-muted">→</span></Link>
                  <div className="mt-0.5 text-xs text-muted">{t.optionAxis}: <span className="font-medium text-ink-2">{t.selectedOption}</span> · #{t.storeProductId}</div>
                </td>
                <td className="tabular px-4 py-3 text-right">
                  <div className="font-semibold">{formatPrice(t.currentPrice, t.currency)}</div>
                  {t.currentMrp && t.currentMrp > t.currentPrice && (
                    <div className="text-xs text-muted line-through">{formatPrice(t.currentMrp, t.currency)}</div>
                  )}
                </td>
                <td className={`tabular px-4 py-3 text-right whitespace-nowrap ${t.stockQty === 0 ? 'text-critical-ink' : ''}`}>{formatStock(t.stockQty)}</td>
                <td className="px-4 py-3 whitespace-nowrap" title={formatDateTime(t.lastSuccessAt)}>{timeAgo(t.lastSuccessAt)}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-col items-start gap-1">
                    <StatusBadge outcome={t.lastOutcome ?? 'pending'} />
                    {t.lastAttemptAt && <span className="text-xs text-muted" title={formatDateTime(t.lastAttemptAt)}>{timeAgo(t.lastAttemptAt)}</span>}
                  </div>
                </td>
                <td className={`tabular px-4 py-3 text-right ${failing ? 'font-semibold text-critical-ink' : 'text-ink-2'}`}>
                  {failing && <span aria-hidden="true">! </span>}{t.consecutiveFailures}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => onUntrack(t)}
                    disabled={busyId === t.id}
                    className="rounded-md px-2.5 py-1 text-xs font-medium text-ink-2 ring-1 ring-line transition-colors hover:bg-critical/10 hover:text-critical-ink hover:ring-critical/30 disabled:opacity-40"
                  >
                    {busyId === t.id ? 'Removing…' : 'Stop tracking'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
