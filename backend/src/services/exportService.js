import { exportAttempts } from '../db/runs.js';

export const CSV_HEADER = ['product_id', 'product_name', 'selected_option', 'timestamp', 'price', 'stock', 'outcome'];

/** RFC 4180 escaping: quote fields containing comma, quote, CR or LF. Null → empty cell. */
export function csvField(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvRow(r) {
  return [
    r.product_id,
    r.product_name,
    r.selected_option,
    new Date(r.timestamp).toISOString(),
    r.outcome === 'success' ? r.price : null,
    r.outcome === 'success' ? r.stock : null,
    r.outcome,
  ].map(csvField).join(',');
}

/** Streams every scrape attempt (including retried/failed) as CSV. */
export async function writeCsv(res) {
  res.write(CSV_HEADER.join(',') + '\r\n');
  for await (const rows of exportAttempts()) {
    res.write(rows.map(csvRow).join('\r\n') + '\r\n');
  }
  res.end();
}
