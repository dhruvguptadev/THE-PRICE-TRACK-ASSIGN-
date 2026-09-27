import StatusBadge from './StatusBadge';
import { formatDateTime, formatPrice, formatStock } from '@/lib/format';

const SOURCE_LABEL = { cron: 'Scheduled', manual: 'Manual', initial: 'Initial', demo: 'Demo' };

/** Every attempt, newest first, including retries and final failures. */
export default function ScrapeLog({ items, currency }) {
  if (!items.length) {
    return <p className="card rounded-2xl bg-surface p-6 text-center text-sm text-muted">No scrape attempts yet.</p>;
  }
  return (
    <div className="card relative overflow-x-auto rounded-2xl bg-surface">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="border-b border-line bg-surface-2/60 text-left text-xs text-muted">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">Started</th>
            <th scope="col" className="px-4 py-3 font-medium">Run</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Attempt</th>
            <th scope="col" className="px-4 py-3 font-medium">Outcome</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Price</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Stock</th>
            <th scope="col" className="px-4 py-3 font-medium">Error</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {items.map((a) => (
            <tr key={a.id} className={a.outcome === 'failed' ? 'bg-critical/5' : a.outcome === 'retried' ? 'bg-warning/5' : undefined}>
              <td className="px-4 py-2.5 whitespace-nowrap">{formatDateTime(a.startedAt)}</td>
              <td className="px-4 py-2.5 text-ink-2" title={a.runKey}>{SOURCE_LABEL[a.triggerSource] ?? a.triggerSource}</td>
              <td className="tabular px-4 py-2.5 text-right text-ink-2">#{a.attemptNumber}</td>
              <td className="px-4 py-2.5"><StatusBadge outcome={a.outcome} /></td>
              <td className="tabular px-4 py-2.5 text-right">{a.outcome === 'success' ? formatPrice(a.price, currency) : '—'}</td>
              <td className="tabular px-4 py-2.5 text-right whitespace-nowrap">{a.outcome === 'success' ? formatStock(a.stockQty) : '—'}</td>
              <td className="px-4 py-2.5">
                {a.errorCode ? (
                  <div className="max-w-md">
                    <code className="font-mono text-xs font-semibold">{a.errorCode}</code>
                    {a.errorMessage && <p className="mt-0.5 line-clamp-2 text-xs text-ink-2" title={a.errorMessage}>{a.errorMessage}</p>}
                  </div>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
