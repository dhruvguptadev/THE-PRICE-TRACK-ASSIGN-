// Outcome badges: status color is never alone; every badge carries an icon + label.
const STYLES = {
  success: { icon: '✓', label: 'Success', cls: 'text-good-ink bg-good/10 ring-good/30' },
  retried: { icon: '↻', label: 'Retried', cls: 'text-warning-ink bg-warning/15 ring-warning/40' },
  failed: { icon: '✕', label: 'Failed', cls: 'text-critical-ink bg-critical/10 ring-critical/30' },
  pending: { icon: '…', label: 'Not scraped yet', cls: 'text-ink-2 bg-surface-2 ring-line' },
};

export default function StatusBadge({ outcome }) {
  const s = STYLES[outcome] ?? STYLES.pending;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap ${s.cls}`}>
      <span aria-hidden="true">{s.icon}</span>
      {s.label}
    </span>
  );
}
