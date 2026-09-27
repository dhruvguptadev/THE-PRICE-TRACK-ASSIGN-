import Link from 'next/link';
import LiveStatus from '@/components/LiveStatus';
import { exportCsvUrl } from '@/lib/api';

export const metadata = {
  title: { absolute: 'Nightwatch: a price scraper that keeps honest books' },
  description:
    'Tracks one product option on the INE mock storefront every two hours, and records every attempt, including the ones that fail.',
};

// Everything on this page is taken from real runs against demo.inelabteamdev.com on 25–26 Sep 2026.
const LEDGER = [
  { time: '23:30', item: 'Halvard Filing Cabinet Aero', option: 'Oak', outcome: 'success', price: '₹32,234', stock: '27' },
  { time: '23:30', item: 'Junova Trekking Poles One', option: 'Family', outcome: 'success', price: '₹35,090', stock: '197' },
  { time: '00:03', item: 'Halvard Filing Cabinet Aero', option: 'Walnut', outcome: 'retried', note: 'price never settled' },
  { time: '00:03', item: 'Halvard Filing Cabinet Aero', option: 'Walnut', outcome: 'success', price: '₹24,760', stock: '138' },
];

const CSV = `product_id,product_name,selected_option,timestamp,price,stock,outcome
2765,Halvard Filing Cabinet Aero,Oak,2026-09-25T18:00:40.900Z,32234.00,27,success
2036,Junova Trekking Poles One,Family,2026-09-25T18:00:57.005Z,35090.00,197,success
2765,Halvard Filing Cabinet Aero,Walnut,2026-09-25T18:33:26.969Z,,,retried
2765,Halvard Filing Cabinet Aero,Walnut,2026-09-25T18:33:55.616Z,24760.00,138,success`;

const STATS = [
  ['2 h', 'between scheduled checks'],
  ['~7 s', 'per product, one at a time'],
  ['3', 'attempts at most, then it gives up'],
  ['960', 'products searchable locally'],
];

const STEPS = [
  ['Check the option still exists', 'One cheap JSON request. A product that’s gone fails once, cleanly, without three browser attempts.'],
  ['Open the product page in a fresh context', 'No cookies or tokens carried over from the previous product.'],
  ['Confirm it’s the right product', 'The heading must match the tracked name before anything else happens.'],
  ['Dismiss the cookie wall, select the option', 'Clicked again if the page drops the event, which it does about a third of the time.'],
  ['Hover until the button unlocks, then click it', 'Real mouse moves, so the page’s own challenge runs and passes.'],
  ['Wait for the real price, not a timer', 'Visible, fully opaque, and fetched for the tracked option key. Up to 20 s.'],
  ['Validate, then write', 'Price, stock and the log row go into the database in one transaction, or not at all.'],
];

const OUTCOME = {
  success: { mark: '✓', cls: 'text-good-ink bg-good/10 ring-good/30', rail: 'bg-good' },
  retried: { mark: '↻', cls: 'text-warning-ink bg-warning/15 ring-warning/40', rail: 'bg-warning' },
  failed: { mark: '✕', cls: 'text-critical-ink bg-critical/10 ring-critical/30', rail: 'bg-critical' },
};

export default function Landing() {
  return (
    <div className="-mt-2 pb-10">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative isolate grid gap-12 pb-14 pt-6 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-16 lg:pt-14">
        <div aria-hidden="true" className="bg-dots absolute inset-x-[-1rem] inset-y-0 -z-10 sm:inset-x-[-1.5rem]" />
        <div aria-hidden="true" className="hero-glow absolute -right-24 top-0 -z-10 h-[32rem] w-[40rem] max-w-full" />
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1 text-xs font-medium text-ink-2 shadow-sm ring-1 ring-line">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent" />
            Price &amp; stock tracker for the INE mock storefront
          </p>
          <h1 className="mt-6 text-4xl font-semibold leading-[1.08] tracking-[-0.03em] sm:text-5xl lg:text-[3.5rem]">
            Checks the price every two hours.
            <span className="block text-accent">Writes down every time it couldn’t.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-ink-2 sm:text-[1.0625rem]">
            Pick a product and the exact option you care about: the walnut finish, not the oak. A headless browser opens the
            real product page on a schedule, gets past what the page puts in the way, and reads the price a customer would
            actually pay. If it can’t, that goes in the log too, and the last good price stays put.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link
              href="/dashboard"
              className="group inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-accent-ink shadow-sm shadow-accent/25 transition-colors hover:bg-accent-strong"
            >
              Open the dashboard
              <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">→</span>
            </Link>
            <a href={exportCsvUrl} className="text-sm font-medium underline decoration-accent/30 decoration-2 underline-offset-4 hover:decoration-accent">
              Download the full log as CSV
            </a>
          </div>
          <div className="mt-8">
            <LiveStatus />
          </div>
        </div>

        {/* A page from the log, not an illustration of one. */}
        <figure className="overflow-hidden rounded-2xl bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.04),0_24px_48px_-16px_rgba(15,23,42,0.18)] ring-1 ring-line">
          <figcaption className="flex items-center justify-between border-b border-line bg-surface-2/60 px-5 py-3">
            <span className="flex items-center gap-2 text-sm font-medium text-ink">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-good ring-4 ring-good/15" />
              Scrape log
            </span>
            <span className="text-xs text-muted">25–26 Sep 2026, IST</span>
          </figcaption>
          <ol className="divide-y divide-line">
            {LEDGER.map((row, i) => {
              const o = OUTCOME[row.outcome];
              return (
                <li key={i} className="relative grid grid-cols-[3rem_1fr_auto] items-center gap-3 px-5 py-3.5 text-sm">
                  <span aria-hidden="true" className={`absolute inset-y-2.5 left-0 w-[3px] rounded-r ${o.rail}`} />
                  <span className="tabular font-mono text-xs text-muted">{row.time}</span>
                  <span className="min-w-0">
                    <span className="block truncate">{row.item}</span>
                    <span className="text-xs text-muted">{row.option}</span>
                  </span>
                  <span className="flex flex-col items-end gap-1 text-right">
                    {row.outcome === 'success' ? (
                      <span>
                        <span className="tabular font-medium">{row.price}</span>
                        <span className="tabular block text-xs text-muted sm:ml-2 sm:inline">{row.stock} in stock</span>
                      </span>
                    ) : (
                      <span className="text-xs text-ink-2">{row.note}</span>
                    )}
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-px text-xs font-medium capitalize ring-1 ring-inset ${o.cls}`}>
                      <span aria-hidden="true">{o.mark}</span>
                      {row.outcome}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="border-t border-line px-5 py-3 text-xs leading-relaxed text-muted">
            The retry is real: the page loaded but the price never settled, so the scraper refused to read it. Half a minute later
            it tried again on a fresh page.
          </p>
        </figure>
      </section>

      {/* ── Numbers ──────────────────────────────────────────── */}
      {/* gap-px over a line-coloured background draws the dividers at any column count. */}
      <dl className="card grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-line lg:grid-cols-4">
        {STATS.map(([value, label]) => (
          <div key={label} className="bg-surface px-5 py-7 sm:px-7">
            <dt className="sr-only">{label}</dt>
            <dd>
              <span className="tabular block text-3xl font-semibold leading-none tracking-tight sm:text-4xl">{value}</span>
              <span className="mt-2.5 block text-sm text-muted">{label}</span>
            </dd>
          </div>
        ))}
      </dl>

      {/* ── The store ────────────────────────────────────────── */}
      <section className="py-20">
        <SectionHead n="01" title="The store doesn’t want to be read.">
          The mock storefront is built to trip up scrapers. None of this was in the brief. It turned up by opening the page and
          looking.
        </SectionHead>

        <ol className="mt-10 grid gap-4 md:grid-cols-6">
          <Trap
            n="1"
            className="md:col-span-3"
            title="The price isn’t on the page until you earn it"
            specimen={
              <span className="flex items-center gap-3">
                <span className="cursor-not-allowed rounded-md bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted ring-1 ring-line">
                  Check today’s price
                </span>
                <span className="font-mono text-xs text-muted">disabled until the hover counts</span>
              </span>
            }
          >
            The HTML is an empty shell, and the product API has no price field. The number only loads after a proof-of-work
            challenge, real mouse movement over the price panel, and a click on <Q>Check today’s price</Q>.
          </Trap>

          <Trap
            n="2"
            className="md:col-span-3"
            title="Two of the three prices are fake"
            specimen={
              <span className="flex flex-wrap items-baseline gap-x-5 gap-y-1 font-mono text-sm">
                <span className="text-muted line-through decoration-critical/70">₹20,748</span>
                <span className="text-muted line-through decoration-critical/70">₹25,193</span>
                <span className="font-semibold text-ink">₹33,523</span>
              </span>
            }
          >
            On the Walnut cabinet, two hidden elements carry made-up prices for anything that reads the DOM naively. Only the one
            element a person can actually see is read, and it has to be fully opaque: while loading it dims to 45% and still
            shows the previous option’s price.
          </Trap>

          <Trap
            n="3"
            className="md:col-span-2"
            title="The price comes in pieces"
            specimen={
              <span className="font-mono text-sm tracking-wide">
                {'₹33,523'.split('').map((c, i, a) => (
                  <span key={i}>
                    {c}
                    {i < a.length - 1 && <span className="mx-[3px] inline-block h-3 w-px translate-y-0.5 bg-critical/60" title="zero-width space" />}
                  </span>
                ))}
              </span>
            }
          >
            Each character sits in its own span, with zero-width and non-breaking spaces between, in Indian digit grouping
            (₹1,29,999). Anything that isn’t exactly one amount is rejected.
          </Trap>

          <Trap
            n="4"
            className="md:col-span-2"
            title="The class names change"
            specimen={
              <span className="flex flex-wrap items-center gap-2 font-mono text-xs">
                <Q>output.xsu-j2</Q>
                <span className="text-muted">rev 632003</span>
              </span>
            }
          >
            That will change. The scraper reads the same class map the page loaded, so it never guesses a selector. A missing
            element is logged as a structure change, not filled in.
          </Trap>

          <Trap
            n="5"
            className="md:col-span-2"
            title="A cookie wall, a shuffled catalogue, a moving default"
            specimen={
              <span className="block w-full">
                <span className="flex justify-between font-mono text-xs text-muted">
                  <span>one pass over 16 pages</span>
                  <span className="tabular">603 / 960</span>
                </span>
                <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-line">
                  <span className="block h-full rounded-full bg-accent" style={{ width: `${(603 / 960) * 100}%` }} />
                </span>
              </span>
            }
          >
            A consent overlay silently swallows the hover on some loads (it gets <Q>Reject</Q>). The listing API reshuffles on
            every request, so search runs on a local copy built over repeated passes. The tracked option is always clicked and
            confirmed.
          </Trap>
        </ol>
      </section>

      {/* ── One attempt ──────────────────────────────────────── */}
      <section id="how" className="relative isolate scroll-mt-20 grid gap-10 py-20 lg:grid-cols-[20rem_1fr] lg:gap-16">
        <div aria-hidden="true" className="absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2 border-y border-line bg-surface" />
        <div className="lg:sticky lg:top-8 lg:self-start">
          <SectionHead n="02" title="One attempt, start to finish">
            About seven seconds per product. Batches run one product at a time in a single Chromium, because the free server has
            512&nbsp;MB.
          </SectionHead>
          <div className="mt-6 rounded-xl bg-warning/10 p-4 text-sm leading-relaxed text-ink-2 ring-1 ring-warning/30">
            <span className="font-medium text-warning-ink">↻ If any step fails,</span> the attempt is logged as{' '}
            <Q>retried</Q> and the whole thing starts again on a fresh page, with a growing, jittered pause. After the third
            try it’s <Q>failed</Q>.
          </div>
        </div>

        <ol className="relative">
          {STEPS.map(([title, body], i) => {
            const last = i === STEPS.length - 1;
            return (
              <li key={title} className="relative grid grid-cols-[2.25rem_1fr] gap-4 pb-7 last:pb-0">
                {!last && <span aria-hidden="true" className="absolute left-[1.125rem] top-9 bottom-0 w-px -translate-x-1/2 bg-line" />}
                <span
                  className={`tabular grid h-9 w-9 place-items-center rounded-full text-xs font-medium ring-1 ${
                    last ? 'bg-accent text-accent-ink ring-accent shadow-sm shadow-accent/30' : 'bg-accent-soft text-accent-strong ring-accent/15'
                  }`}
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="pt-1.5">
                  <h3 className="font-semibold text-ink">{title}</h3>
                  <p className="mt-1 text-[0.95rem] leading-relaxed text-ink-2">{body}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {/* ── Rules ────────────────────────────────────────────── */}
      <section className="py-20">
        <SectionHead n="03" title="What it won’t do" />
        <dl className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Rule term="Guess">
            A price that can’t be verified is a failure, not a best effort. The database itself rejects a price on any attempt
            that isn’t a success.
          </Rule>
          <Rule term="Overwrite the last good price">
            A failed check leaves the current price alone. The dashboard shows it with the time it was last confirmed.
          </Rule>
          <Rule term="Retry forever">
            Three attempts with growing, jittered pauses. Timeouts and page shifts are retried; a missing product isn’t.
          </Rule>
          <Rule term="Stop quietly">
            Every scheduled run is keyed to its two-hour slot. If none has started in two and a half hours, the dashboard says
            so. A run cut short by a restart is closed out as failed.
          </Rule>
        </dl>
      </section>

      {/* ── Export ───────────────────────────────────────────── */}
      <section className="grid gap-10 border-t border-line py-20 lg:grid-cols-[20rem_1fr] lg:gap-16">
        <SectionHead n="04" title="Take the data with you">
          One row per attempt, not per success. A retried or failed row has an empty price and stock, because nothing was read.
        </SectionHead>
        <div className="card min-w-0 overflow-hidden rounded-2xl bg-surface">
          <div className="flex items-center justify-between gap-3 border-b border-line bg-surface-2/60 px-4 py-2.5">
            <span className="truncate font-mono text-xs text-ink-2">scrape-history.csv</span>
            <a
              href={exportCsvUrl}
              className="shrink-0 rounded-md bg-surface px-2.5 py-1 text-xs font-medium ring-1 ring-line hover:bg-surface-2"
            >
              ↓ Download
            </a>
          </div>
          <pre className="overflow-x-auto py-3 font-mono text-[12.5px] leading-6 text-ink-2">
            {CSV.split('\n').map((line, i) => (
              <span
                key={i}
                className={`block px-4 ${i === 0 ? 'text-muted' : line.endsWith('retried') ? 'bg-warning/10 text-warning-ink' : ''}`}
              >
                {line}
              </span>
            ))}
          </pre>
        </div>
      </section>

      {/* ── Closing CTA ──────────────────────────────────────── */}
      <section className="cta-band relative isolate mb-14 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl px-6 py-12 sm:flex-row sm:items-center sm:px-12">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">See what it found today.</h2>
          <p className="mt-2 text-sm text-white/70">Search the catalogue, track an option, and watch the history build up.</p>
        </div>
        <Link
          href="/dashboard"
          className="group inline-flex shrink-0 items-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-semibold text-ink shadow-sm transition-colors hover:bg-accent-soft"
        >
          Open the dashboard
          <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">→</span>
        </Link>
      </section>

      <footer className="flex flex-wrap items-baseline justify-between gap-4 border-t border-line pt-6 text-xs text-muted">
        <p>
          <span className="font-medium text-ink-2">Nightwatch</span> · Next.js on Vercel · Express, Playwright and Prisma on Render · Postgres on Supabase · triggered by cron-job.org.
        </p>
        <p>
          Only ever scrapes <span className="font-mono">demo.inelabteamdev.com</span>, the store it was built for.
        </p>
      </footer>
    </div>
  );
}

function SectionHead({ n, title, children }) {
  return (
    <header className="max-w-2xl">
      <p className="tabular inline-flex h-7 items-center rounded-md bg-accent-soft px-2 text-xs font-semibold text-accent-strong">{n}</p>
      <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-[-0.025em] sm:text-4xl">{title}</h2>
      {children && <p className="mt-4 text-sm leading-relaxed text-ink-2 sm:text-[0.95rem]">{children}</p>}
    </header>
  );
}

function Trap({ n, title, specimen, className = '', children }) {
  return (
    <li className={`card flex flex-col overflow-hidden rounded-2xl bg-surface transition duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-ink/5 ${className}`}>
      <div className="flex min-h-20 items-center border-b border-line bg-surface-2/60 px-5 py-4">{specimen}</div>
      <div className="flex-1 p-5 sm:p-6">
        <h3 className="flex items-start gap-3 text-base font-semibold">
          <span className="tabular grid h-6 w-6 shrink-0 place-items-center rounded-md bg-accent text-xs font-semibold text-accent-ink">{n}</span>
          {title}
        </h3>
        <p className="mt-2 text-[0.93rem] leading-relaxed text-ink-2">{children}</p>
      </div>
    </li>
  );
}

function Rule({ term, children }) {
  return (
    <div className="card rounded-2xl bg-surface p-5 sm:p-6">
      <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-full bg-critical/10 text-sm font-semibold text-critical-ink ring-1 ring-critical/20">
        ✕
      </span>
      <dt className="mt-4 text-base font-semibold leading-snug">{term}</dt>
      <dd className="mt-3 text-[0.93rem] leading-relaxed text-ink-2">{children}</dd>
    </div>
  );
}

function Q({ children }) {
  return <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[0.85em] text-ink">{children}</code>;
}
