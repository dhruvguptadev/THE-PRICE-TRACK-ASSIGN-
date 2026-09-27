const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });

export function formatPrice(value, currency = 'INR') {
  if (value === null || value === undefined) return '—';
  if (currency && currency !== 'INR') {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(value);
  }
  return inr.format(value);
}

export function formatStock(qty) {
  if (qty === null || qty === undefined) return '—';
  return qty === 0 ? 'Sold out' : `${qty.toLocaleString('en-IN')} in stock`;
}

const dateTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
const shortDate = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export const formatDateTime = (iso) => (iso ? dateTime.format(new Date(iso)) : '—');
export const formatShort = (iso) => (iso ? shortDate.format(new Date(iso)) : '—');

export function timeAgo(iso, now = Date.now()) {
  if (!iso) return 'never';
  const s = Math.round((now - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}
