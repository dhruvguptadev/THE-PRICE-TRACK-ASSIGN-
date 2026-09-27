# Product Requirements Document (PRD)

## 1. Document Control

| Field | Value |
|---|---|
| Project | Nightwatch (Mock Storefront — Product Search & Scheduled Price Tracker) |
| Document | Product Requirements Document |
| Status | Implementation Ready |
| Deadline | September 27, 2026 — 1:00 PM IST |
| Primary Target Store | https://demo.inelabteamdev.com/ |
| Primary Audience | Assignment reviewer / engineering team |

## 2. Problem Statement

Build a small full-stack application that lets a user search the provided mock storefront by partial or full product name, choose a specific product option/variant, and track that option's price and stock over time through scheduled scraping.

The primary engineering challenge is scraper reliability. The application must continue working across unattended runs, tolerate slow or failing requests, retry recoverable failures, and avoid silently storing incorrect or empty price/stock values.

## 3. Goals

### 3.1 Primary Goals

1. Allow product search by partial or full product name.
2. Allow the user to select one specific product option/variant to track.
3. Persist tracked products/options in PostgreSQL via Supabase.
4. Scrape current price and stock every 2 hours.
5. Handle slow responses, transient HTTP failures, asynchronous content, and page changes gracefully.
6. Persist an honest scrape attempt log for every attempt.
7. Display price/stock history as a chart and/or table.
8. Export the complete scrape history as CSV.
9. Provide a headed Playwright execution path that can be screen-recorded.
10. Deploy the frontend to Vercel and backend to Render using free-tier-compatible scheduling architecture.

### 3.2 Success Criteria

The system is successful when:

- At least 2–3 products/options are visibly tracked in the live submission environment.
- Scheduled runs occur every 2 hours using an external scheduler or scheduled function.
- Successful scrapes persist valid price and stock values.
- Failed attempts are persisted with empty price and stock rather than fabricated/previous values.
- Retry behavior is visible in scrape logs.
- Exported CSV contains one row per scrape attempt and includes failed attempts.
- The headed scraper demonstration shows a real run against the assigned store and demonstrates slow/failing-response handling.
- A repository reviewer can reproduce the system from README instructions.

## 4. Non-Goals

- Scraping real retailers or third-party stores.
- Building a production-scale retail aggregation platform.
- Multi-store support in the MVP.
- Complex account management/authentication unless required by deployment constraints.
- Mobile apps.
- Real-time price streaming.
- Advanced alerting unless implemented as a bonus.

## 5. Target User Journey

```text
Open dashboard
    ↓
Search product name
    ↓
Review matching products
    ↓
Open/select product
    ↓
Select exact option/variant
    ↓
Create tracking record
    ↓
Initial scrape
    ↓
Dashboard shows latest price + stock
    ↓
Every 2 hours: scheduler triggers scrape
    ↓
Scrape attempt is logged
    ↓
Successful result becomes history point
    ↓
Failure remains visible as failure; previous value is not overwritten
```

## 6. Functional Requirements

### FR-01 Product Search

The application shall allow partial or full product-name search against the provided storefront.

The store has no server-side search and its listing API returns a random order on every request. Search therefore runs against a local catalog cache (`catalog_products`) synced from the store's listing API.

Acceptance criteria:

- Empty query does not trigger a search.
- Partial text (case-insensitive) returns matching products by name or brand.
- Catalog sync collects all products the store reports (`count`), with duplicates removed across shuffled pages. Incompleteness is reported, not hidden.
- Search results expose name, brand and category to identify the correct product.
- Product page URL (`/item/<id>`) and the numeric store product ID are retained.

### FR-02 Product Option Selection

The application shall allow the user to choose the exact product option/variant to track because options may have different prices.

Acceptance criteria:

- Options are loaded live from the store (`optionAxis` + `options[{id,label}]`).
- A tracked item contains the option axis, the option label and the store option key (e.g. `o1`).
- The scraper confirms the tracked option is active on the page before reading price/stock.
- Changing an option creates a new tracking target or explicitly updates the tracked target; it must not silently mix histories.

### FR-03 Create Tracking Record

The user shall be able to add a selected product option to tracked items.

Acceptance criteria:

- Tracking target is persisted in Supabase.
- Duplicate active tracking targets are prevented by an application check and a unique index over active rows. Re-tracking a deactivated target reactivates it and keeps its history.
- Product name, URL and option label are taken from the store, not from client input.
- The tracking record retains the source URL and option information required by the scraper.

### FR-04 Scheduled Scraping

Each active tracked product option shall be scraped once every 2 hours.

Acceptance criteria:

- The system uses an external scheduler or scheduled function rather than depending on an always-running in-process timer.
- A scheduler-triggered run is safe to retry: runs are keyed by their 2-hour UTC slot (`run_key`), so a duplicate trigger is a no-op.
- A single target is not concurrently scraped twice by overlapping runs.
- One target failing does not prevent the remaining targets from being processed.

### FR-05 Scraper Reliability

The scraper shall use lightweight HTTP where the store exposes the data (catalog, options, UI manifest) and Playwright only for price and stock, which the store reveals only after a browser-side challenge and mouse-hover check.

Acceptance criteria:

- Explicit HTTP, navigation and price-ready timeouts are configured.
- Transient failures and page shifts are retried with bounded exponential backoff (max 3 attempts).
- Permanent failures (product gone, option no longer offered) fail immediately and cleanly.
- Dynamic content uses condition-based waits (price visible and not pending), not arbitrary sleeps.
- Selectors come from the store's UI manifest on each run, never hard-coded rotating class names.
- The hidden decoy price element is never used.
- Extraction validates required fields before a successful history row is committed.
- A parser mismatch that persists across all attempts results in a `failed` attempt (`STRUCTURE_CHANGED`), not guessed data.

### FR-06 Price and Stock History

The dashboard shall show historical price and stock observations for each tracked target.

Acceptance criteria:

- Only validated successful observations are shown as successful history points.
- History is ordered by observation time.
- Failed attempts remain visible through the scrape log.

### FR-07 Scrape Log

The dashboard shall expose every scrape attempt, including retries and final failures.

Required outcome values:

- `success`
- `retried`
- `failed`

Implementation: one log row per attempt, with `attempt_number`, `run_id`, `outcome`, `error_code` and `error_message`. `retried` means "this attempt failed and another attempt followed"; `failed` means "final attempt failed". This interpretation is documented in the README so reviewers read the log correctly.

### FR-08 CSV Export

An Export action shall download full scrape history as CSV.

Each row shall contain:

- store product ID as shown in the product-page URL (numeric `id` in `/item/<id>`)
- product name
- selected option
- timestamp in ISO 8601 UTC
- price (main displayed price, as a number)
- stock (unit count; 0 = sold out)
- outcome (`success` / `retried` / `failed`)

Retried and failed rows shall have empty price and stock.

### Tracked Price Definition

The product page may show MRP (struck-through), a sale price and a member price. The tracked **price** is the main displayed price, i.e. what a normal customer pays. MRP is stored as extra information. Member price is not tracked.

### FR-09 Headed Run

The backend shall expose a controlled way to start a scraper run in headed mode for demonstration/debugging.

Acceptance criteria:

- A developer can launch Playwright with a visible browser locally via a CLI command (not an HTTP endpoint; Render has no display).
- The headed mode uses the same scraper code as production, with slowed-down actions.
- A demo scenario can show a slow or failed response and the retry/failure handling.

## 7. Non-Functional Requirements

### NFR-01 Correctness

Never persist a successful price/stock observation unless required fields are present and pass validation.

### NFR-02 Reliability

A transient scrape error shall not terminate the complete batch.

The system shall never stop silently:

- missed scheduled runs are detected (`schedulerStale` in health + dashboard banner + cron-job.org failure notifications)
- runs interrupted by a crash/restart are closed as `failed` by the next run
- targets that keep failing are highlighted (`consecutive_failures`)

### NFR-03 Observability

Each scrape attempt shall be traceable using a `run_id`, tracked target ID, attempt number, start/end timestamps, outcome, and error information when applicable.

### NFR-04 Performance

Dashboard reads should use stored data rather than scraping on every page request.

### NFR-05 Security

- Server-only secrets must never be exposed to the frontend.
- Scheduler-triggered endpoints must use a secret token.
- Input values must be validated before database access or scraping.
- Database access should use least-privilege credentials appropriate to the deployment model.

### NFR-06 Deployability

The application shall run on Vercel + Render + Supabase and work despite backend sleep/cold-start constraints:

- The scheduler endpoint responds `202` immediately and scrapes in the background (cron-job.org times out after ~30 s).
- The scraper fits in Render free's 512 MB: one browser, sequential targets, always closed.
- The database is reached through the Supabase session pooler (Render has no outbound IPv6).

### NFR-07 Maintainability

Scraper code should be separated from HTTP routes and persistence. The parser must be independently testable against saved fixtures.

## 8. Recommended MVP Scope

### Must Have

- Product search
- Product/option selection
- Tracking CRUD
- Initial scrape
- 2-hour scheduled scrape
- Retry/timeout handling
- Price/stock history
- Scrape logs including failures
- CSV export
- Headed run
- Vercel/Render/Supabase deployment

### Should Have

- Dashboard summary cards
- Last successful scrape time
- Last attempt status
- Consecutive failure count
- Scraper parser validation diagnostics
- Basic health endpoint

### Could Have

- Price-drop/back-in-stock alerts
- Structure-change detection
- Configurable frequency
- Multiple options per product in one scrape
- GitHub Actions CI/CD

## 9. Data Integrity Rules

1. A failed scrape must not create a successful history observation.
2. A failed scrape must not replace the latest known price with null inside the product's current-state record.
3. Failed attempts must exist in the scrape log.
4. A retry is an attempt, not a successful observation.
5. Only a validated successful extraction can update the latest state.
6. Source page/option identity is immutable for a tracking target unless an explicit update operation is performed.

## 10. Verified Store Facts and Remaining Assumptions

Verified by inspection on 2026-09-25 (details in `research.md`):

- The store is a client-rendered SPA; HTML contains no product data.
- Catalog (960 products) and options are available from a JSON API; listing order is random per request.
- Product pages are `/item/<id>`.
- Price and stock are available only in a browser, after a challenge + hover.
- CSS class names rotate per UI manifest revision; a hidden decoy price element exists.
- Stock is shown as a unit count or "Sold out".

Remaining assumptions:

- Playwright Chromium fits within Render free-tier memory for sequential scraping of a few targets.
- A single backend deployment can handle the assignment-scale workload.
- End-user authentication is unnecessary for the assignment.

## 11. Traceability to Assignment Brief

| Assignment requirement | PRD coverage |
|---|---|
| Search by partial/full product name | FR-01 |
| Pick product + option | FR-02 |
| Persist tracked products in Supabase | FR-03 |
| 2-hour scraping | FR-04 |
| Reliable unattended scraping | FR-05, NFR-01, NFR-02 |
| Price + stock history | FR-06 |
| Per-product scrape log | FR-07 |
| CSV export | FR-08 |
| Headed recording | FR-09 |
| Vercel frontend | NFR-06 |
| Render backend | NFR-06 |
| Supabase PostgreSQL | NFR-06 |
| Free-tier scheduler strategy | FR-04, NFR-06 |
| Bonus capabilities | Section 8 |

## 12. Definition of Done

A feature is done only when implementation, error handling, database behavior, automated/manual validation, and documentation are complete. For scraper features, “done” additionally means that both success and failure paths have been tested.
