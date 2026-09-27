# Engineering Decision Log / Design Note

## Design Note

*How the scraping was made reliable, what trade-offs were made, and what the AI tools got wrong on the first attempt.*

### How the scraping is made reliable

- **Right tool per data type.** Catalog and options come from the store's JSON API over plain HTTP. Price and stock need a browser, because the store gates them behind a proof-of-work challenge and hover telemetry, so only that part uses Playwright.
- **Complete search despite a shuffled catalog.** The listing API returns a different random order per request. The catalog is synced into Postgres with repeated passes until every ID is collected, and search runs against that cache.
- **No hard-coded volatile selectors.** Class names are read from `/api/v2/ui/manifest` on every run. The hidden decoy `.price-value` is never read.
- **Wait for the real state, not a fixed time.** The scraper waits for the price to be visible, not pending (dimmed), and for the correct option to be active.
- **Bounded retries with classification.** Transient failures and page shifts are retried up to 3 times with jittered backoff. Permanent failures fail immediately.
- **Fail closed.** Anything that doesn't pass validation is a failure. The database CHECK constraint makes it impossible to store a price on a non-success attempt.
- **Honest log.** Every attempt is a row (`success` / `retried` / `failed`), with an error code and the manifest revision.
- **Free-tier safe scheduling.** cron-job.org → `202` + background batch. The 2-hour-slot `run_key` makes duplicate triggers harmless.

### Trade-offs

- Playwright on Render free (512 MB) is heavier and slower than HTTP, but reverse-engineering the obfuscated challenge would break whenever the store changes it.
- The catalog cache can be slightly stale. Product detail and options are always fetched live before tracking.
- Per-attempt logging makes the log grow ~3× faster in bad periods, but it shows exactly what happened.
- Sequential scraping is slow but predictable in memory; fine for a handful of targets.

### What the AI tools got wrong on the first attempt, and the fix

| First attempt (AI-generated docs) | What inspection showed | Correction |
|---|---|---|
| "HTTP fetch + HTML parsing first, Playwright as fallback" | Pages are an empty SPA shell. Price isn't in HTML or the JSON API; it needs a browser challenge + hover | Hybrid: JSON API for catalog/options, Playwright as the **primary** path for price/stock |
| Search by scraping a search/listing page | No search param, and listing order is random per request (one full crawl got 617/960) | Sync catalog to Postgres with completeness check; search the cache |
| Example product URL `/products/123` | Real route is `/item/:id` | Product ID = numeric `id` from `/item/<id>` |
| Stock as `in_stock` / `out_of_stock` / `unknown` | Store shows a unit count | Store `stock_qty` integer; status derived |
| "Don't retry selector misses / malformed extraction" | Misses are mostly transient here (late content, dropped hover events, rotating classes), and the brief says to recover when a page shifts | Retry with fresh page + fresh manifest; `STRUCTURE_CHANGED` if persistent |
| Frontend documented as React + Vite (`VITE_API_BASE_URL`) | Repo uses Next.js 16 | Docs switched to Next.js, `NEXT_PUBLIC_API_BASE_URL` |
| `SUPABASE_DATABASE_URL` direct connection | Supabase direct connection is IPv6-only; Render can't reach it | Use the session pooler connection string |
| Scheduler endpoint may run synchronously | cron-job.org times out ~30 s; cold start + Playwright is longer | Always `202` + background batch, with the instance kept warm (see Decision 005) |
| No detection of missed/stuck runs | Brief says "never silently stop" | `schedulerStale` in health + dashboard banner; stuck runs closed as `failed` |

Implementation-time corrections (found by driving the real page):

| Assumed in the docs | What the live page did | Correction |
|---|---|---|
| Hovering the price panel loads the price | Hover only enables a `Check today's price` button; the quote loads after clicking it | Hover until the button enables, click, wait for `offer-ready` |
| Nothing blocks the page | A cookie-consent modal appears ~3 s after load on some loads and swallows the hover, so the price never unlocks | Wait briefly for it and click **Reject**; also a Playwright locator handler for late appearances |
| The first option is preselected | Default option varies per product/load | Always click the tracked chip and confirm `aria-pressed` + the quote's `opt=` key |
| One decoy (`.price-value`) | A second hidden decoy `.amount[data-price]` | Only read the single *visible* `<priceTag>.<priceValue>` element |
| Fetch the manifest once per run | The page loads its own manifest; classes can rotate between our fetch and the page's | Use the manifest the page itself loaded; ours is the fallback |
| Same-slot duplicate cron trigger while the batch is still running → `409` (first implementation) | api.md says a duplicate slot is `200 duplicate` | Check the slot's `run_key` before the "batch running" guard |
| 8 catalog passes are enough | Real sync reached 960/960 exactly on pass 8 | Pass limit raised to 15 |
| Catalog sync can page as fast as possible | ~100 back-to-back listing requests got `429` from the store, which then failed the next tracking request | 250 ms pause between listing requests |
| Prisma handles timestamps transparently | With a non-UTC database session, `@prisma/adapter-pg` shifted `timestamptz` reads/writes by the session offset (+05:30 locally) | Pin every connection to `TimeZone=UTC` via the pool's startup options |
| The page's manifest is available once the heading renders | Sometimes still in flight, so the scraper had no class map | Explicitly await the page's manifest response |
| "Panel ready but price selector missing" means the page shifted | Live run: the manifest-classed element *was* present but never settled; logged as `STRUCTURE_CHANGED` | Report it as `PRICE_NOT_READY` with opacity/text diagnostics; keep `STRUCTURE_CHANGED` for a truly missing element |
| One warm-up ping 5 min before each scrape keeps Render awake long enough | Render logs showed `SIGTERM` ~15 min after every start, and cron-job.org reported the scrape job as `Failed (output too large)` | Health ping every 10 min (plus UptimeRobot every 5 min) so the instance never idles; the scrape job now gets `202 Accepted` |
| Shutting down on `SIGTERM` can close the DB pool immediately | A deploy during a batch crashed it with `Cannot use a pool after calling end on the pool` | On `SIGTERM`, wait up to 45 s (`SHUTDOWN_DRAIN_MS`) for the in-flight scrape before closing the pool |
| Prices use ASCII digits | First live scrapes on Render: the store rendered `₹３６,５５６` in fullwidth digits; the strict parser rejected it (correctly) and only the retry succeeded | Fold fullwidth (NFKC) and native-script digits to ASCII before parsing; still reject anything that isn't exactly one amount |

---

## Decision 001 — Next.js (React) for frontend

**Decision:** Use Next.js 16 (React 19, App Router, JavaScript, Tailwind CSS 4), already scaffolded in `frontend/`.

**Why:** The assignment allows React.js. Next.js is React and deploys to Vercel with zero configuration. Pages mostly render client-side from the Express API.

**Trade-off:** Next.js 16 has breaking changes from older versions; check `frontend/node_modules/next/dist/docs/` before using APIs (see `frontend/AGENTS.md`). No Next.js API routes are used for backend logic. The backend stays on Render as required.

## Decision 002 — Node.js + Express for backend

**Decision:** Use Node.js + Express 5 with ES Modules.

**Why:** One language across frontend, API and Playwright scraper. Express 5 forwards async handler errors to error middleware natively.

**Trade-off:** Django has more built in, but the small scope doesn't need it.

## Decision 003 — Modular monolith instead of microservices

**Decision:** Keep API, scrape orchestration, scraper and persistence in one deployable backend with clear internal modules.

**Why:** Small workload, time-boxed assignment. A separate scraper service adds deployment and failure modes without benefit.

**Trade-off:** API and scraper share the 512 MB instance, so scrape batches run sequentially.

## Decision 004 — HTTP for catalog/options, Playwright for price/stock

**Decision:** Use the store's JSON API (`/api/v2/listings`, `/api/v2/items/:id`, `/api/v2/ui/manifest`) over plain HTTP wherever it has the data. Use Playwright only to read price and stock.

**Why:** Verified during inspection: price/stock are not in any plain API response. They load only after a browser proof-of-work challenge plus trusted mouse-hover telemetry. This is exactly the "page genuinely requires it" case in the brief. Everything else stays lightweight.

**Rejected:** Reverse-engineering the challenge to call the price endpoint over HTTP. The code is obfuscated and deliberately anti-automation. Replicating it would be fragile and would effectively forge human telemetry.

## Decision 005 — External scheduler with async trigger

**Decision:** cron-job.org calls `POST /api/scrape/run` every 2 hours with a bearer secret. The endpoint returns `202` and runs the batch in the background. A second job pings `GET /api/health` every 10 minutes so the instance never sleeps, and an UptimeRobot monitor pings it every 5 minutes as a backup that also emails on downtime.

**Why:** Free Render instances sleep after ~15 min idle and cold-start in ~50 s. cron-job.org times out after ~30 s. The first version pinged once, 5 minutes before each scrape, but production logs showed the instance being stopped every ~15 minutes, so it is now kept awake continuously. The brief says to "keep the instance warm if needed".

**Trade-off:** External dependency. Mitigated by the secret, idempotent `run_key`, and the visible run history.

## Decision 006 — Local catalog cache for search

**Decision:** Sync all listings into `catalog_products` and search with `ILIKE`.

**Why:** No server-side search, and listing order is random per request, so live paging misses products.

**Trade-off:** Cache can be stale. Mitigated by sync on startup when empty, a protected sync endpoint, and live detail fetch before tracking.

## Decision 007 — Keep current state separate from history

**Decision:** Latest successful price/stock on `tracked_products`, all valid observations in `price_observations`.

**Why:** Simple dashboard reads, append-only history.

**Trade-off:** Duplicated state, so success updates run in one transaction.

## Decision 008 — Failed scrape never overwrites last known successful value

**Decision:** Failures update attempt metadata only.

**Why:** The CSV shows failed attempts with blank price/stock, while the dashboard still shows the last known good value, clearly labelled with its time.

## Decision 009 — One row per scrape attempt

**Decision:** Record every attempt; `retried` = an attempt that failed and was followed by another.

**Why:** An honest audit trail that shows retry behavior to the reviewer.

**Trade-off:** More rows than one-per-run.

## Decision 010 — Retry transient failures and page shifts, not permanent ones

**Decision:** Retry timeouts, network errors, 408/429/5xx, challenge not completing, price not appearing, and locator misses (with fresh page + fresh manifest). Don't retry product 404 or option no longer offered.

**Why:** On this store, a locator miss is usually temporary, and the brief requires recovery when the page shifts. A miss that persists across all attempts is logged as `STRUCTURE_CHANGED`, not guessed around.

## Decision 011 — Validate before persistence

**Decision:** A result is accepted only if product name, active option, visible and non-pending price, not the decoy, price > 0, and stock ≥ 0 all pass. A DB CHECK constraint also blocks price/stock on non-success rows.

**Why:** The worst failure is a wrong price recorded as success.

## Decision 012 — Track the main displayed price

**Decision:** Track the primary price element (`priceValue`), store MRP separately, ignore member price.

**Why:** The page shows up to three prices. The one a normal customer pays is the meaningful one to track.

## Decision 013 — Manifest-driven selectors

**Decision:** Read CSS class names from `/api/v2/ui/manifest` each run and record its `revision` on every attempt.

**Why:** Class names rotate between revisions. Hard-coded classes would break silently.

## Decision 014 — Fixtures for parser tests

**Decision:** Save manifest/item JSON and rendered DOM snapshots (after the price loads) as fixtures.

**Why:** Deterministic normalization/validation tests without hitting the live store.

## Decision 015 — No arbitrary long sleeps

**Decision:** Use condition-based waits. The only deliberate wait is the hover dwell the page requires.

**Why:** Fixed sleeps are slow and still unreliable under variable latency.

## Decision 016 — Soft deactivate tracked products

**Decision:** Delete = `active=false`. Re-tracking the same product+option reactivates the row. There is a unique index over active rows only.

**Why:** History stays available for the dashboard and export.

## Decision 017 — Protected scrape endpoints

**Decision:** Scheduler, manual scrape and catalog sync require a bearer secret. Headed runs are local CLI only.

**Why:** Prevents anyone from generating load on the store or duplicate runs. Render has no display for headed mode.

## Decision 018 — Supabase via session pooler, server-side only

**Decision:** The backend uses `pg` with the Supabase session pooler string. RLS is enabled with no public policies.

**Why:** Render can't reach Supabase's IPv6-only direct host. `pg` gives real transactions. RLS closes the auto-generated public REST API.

## Decision 019 — Prisma on top of the SQL schema

**Decision:** Use Prisma 7 (`prisma-client` generator + `@prisma/adapter-pg`) for data access, with `backend/db/schema.sql` as the schema source and `prisma db pull` to generate models. Pinned to 7.10.0.

**Why:** Typed queries and less hand-written SQL. Introspection keeps the partial unique index; the CHECK constraints (price only on success) can't be expressed in `schema.prisma` but remain enforced by the database.

**Trade-offs / exceptions:**

- The session-level advisory lock uses a raw `pg` client from the same pool; Prisma can't pin one connection for minutes.
- Catalog upsert (960 rows) and ranked search use `$executeRaw` / `$queryRaw`; Prisma has no bulk upsert or ranked ordering.
- `npm`'s `latest` tag for `prisma` pointed at an 8.0 release candidate, so versions are pinned exactly.
- The generated client is TypeScript, so Node ≥ 22.18 is required.

## Resolved by Target-Site Inspection (2026-09-25)

| Question | Answer |
|---|---|
| Product listing/search URL | `/api/v2/listings?page=N&limit≤60` (JSON, random order, no search) |
| Product page URL shape | `/item/:id` |
| Product ID encoding | numeric `id` in the path |
| Option structure | `optionAxis` + `options: [{ id: "o1", label: "Oak" }]` from `/api/v2/items/:id` |
| Price source | browser-only, after challenge + hover; visible element uses manifest class `priceValue` |
| Stock representation | unit count pill, or "Sold out" |
| Loaded after initial HTML? | Everything (SPA); price additionally gated |

## Still Open

1. Exact option-selector interaction on the product page (buttons vs select), to confirm in headed mode.
2. How often the manifest revision changes (per deploy, per time window, per request?).
3. Which slow/error behaviors the store reproduces most often (for the demo).
4. Real Chromium memory use on Render free with 3 targets.
