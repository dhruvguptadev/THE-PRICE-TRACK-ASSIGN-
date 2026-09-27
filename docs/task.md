# TASK — Implementation Plan

## 1. Deadline

**September 27, 2026 — 1:00 PM IST**

The assignment is time-boxed. Prioritize the evaluated core: reliable scraping, honest logs, scheduled execution, persistence, deployment, and a convincing headed-mode demonstration.

**Critical path:** the deployed scraper must run unattended for as long as possible before submission (12 runs/day at a 2-hour interval). Deploy the scraper + scheduler early and polish afterwards.

## 2. Execution Strategy

Build in vertical slices instead of completing the frontend first:

```text
1. Inspect target store               ✅ done (research.md §3)
2. Lock scraper contract
3. Set up database
4. Build catalog client + price scraper + tests
5. Build scrape orchestration
6. Build API
7. Deploy backend + scheduler         ← start unattended runs ASAP
8. Build dashboard
9. Deploy frontend
10. Validate unattended behavior
11. Record demo
12. Final submission check
```

## 3. Phase 0 — Repository Bootstrap

- [x] Create repository.
- [x] Create `frontend/` (Next.js 16) and `backend/` (Express 5).
- [x] Add root `.gitignore`.
- [x] Add `README.md` at repo root.
- [x] Add `docs/` documentation.
- [x] Add `backend/.env.example` and `frontend/.env.example`.
- [x] Fix `backend/package.json` entry point (`main`/`start` → `src/server.js`).
- [x] Add backend npm scripts: `dev`, `start`, `test`, `scrape:headed`.
- [x] Pin Node version (`"engines": { "node": ">=20" }`).

## 4. Phase 1 — Inspect the Mock Store ✅

- [x] Open target homepage: SPA shell, no data in HTML.
- [x] Identify search flow: no server search; listings are shuffled per request.
- [x] Record product URL structure: `/item/:id`.
- [x] Extract store product ID from product URL: numeric `id`.
- [x] Identify options: `optionAxis` + `options[{id,label}]` from `/api/v2/items/:id`.
- [x] Identify price source: browser-only after challenge + hover.
- [x] Identify stock: count pill / "Sold out".
- [x] Inspect network/bundle: `/api/v2/listings`, `/api/v2/items/:id`, `/api/v2/ui/manifest`.
- [x] Confirm option-selection UI and hover behavior in a headed browser.
- [x] Save fixtures: manifest JSON, item JSON, rendered DOM snapshots (split price, sale price, sold out).

## 5. Phase 2 — Supabase Database

- [x] Create Supabase project.
- [x] Write `backend/db/schema.sql` from `database.md` §9 and run it.
- [x] Connect via **session pooler** string (`DATABASE_URL`).
- [x] Test success transaction (attempt + observation + current state).
- [x] Test failed attempt leaves current state unchanged.
- [x] Verify CHECK blocks price on non-success attempts.
- [x] Verify history query ordering.

## 6. Phase 3 — Store Client + Scraper Core (Highest Priority)

### Store client (HTTP)

- [x] `fetchJson` with timeout, retry on 429/5xx/network errors.
- [x] `getListingsPage`, `getItem`, `getManifest`.
- [x] Catalog sync: repeated full passes until unique IDs == `count` (max passes), upsert `catalog_products`, report completeness.

### Price scraper (Playwright)

- [x] Install Playwright + Chromium.
- [x] Browser lifecycle: one browser per batch, new context per target, close in `finally`. Block images/fonts.
- [x] Navigate to `/item/:id`, wait for product name.
- [x] Select the tracked option; confirm it is active.
- [x] Hover the price panel with multiple `page.mouse.move` steps + dwell; repeat if the "Hover over the price area" message persists.
- [x] Wait for the `priceTag.priceValue` element to be visible and not pending.
- [x] Read visible price text (never `.price-value` decoy); read MRP; read stock.

### Normalization + validation

- [x] Strip `​`, NBSP, currency symbol, Indian grouping → number.
- [x] Stock text → integer (0 for "Sold out").
- [x] Reject name mismatch, wrong active option, pending price, non-positive/NaN price, negative stock.
- [x] Unit tests with fixtures.

### Retry + classification

- [x] Max 3 attempts, exponential backoff with jitter.
- [x] Transient: timeout, network, 408/429/5xx, challenge timeout, price not shown.
- [x] Page shifted: locator miss → retry with fresh page + fresh manifest; `STRUCTURE_CHANGED` if all attempts miss.
- [x] Permanent: product 404, option gone → fail immediately.

## 7. Phase 4 — Scrape Orchestration

- [x] `run_key` = `cron-<UTC 2h slot>`; insert `scrape_runs` `ON CONFLICT DO NOTHING`.
- [x] In-process "batch running" guard + `pg_try_advisory_lock`.
- [x] Load active targets; process sequentially and independently.
- [x] Write one attempt row per attempt (`retried` / `failed` / `success`).
- [x] On success: attempt + observation + current state in one transaction.
- [x] On final failure: attempt + `consecutive_failures++`, no current-state change.
- [x] Finish run with counts and status (`completed` / `partial` / `failed`).
- [x] At run start, close runs stuck `running` >30 min as `failed`.
- [x] Health endpoint: `lastCronRunAt`, `schedulerStale` (>2 h 30 min); dashboard banner when stale.

## 8. Phase 5 — Backend API

- [x] `GET /api/health`
- [x] `GET /api/products/search` (catalog cache)
- [x] `GET /api/products/:storeProductId` (live item + options)
- [x] `POST /api/catalog/sync` (protected)
- [x] `POST /api/tracked-products` (validate against store; reactivate if soft-deleted; queue initial scrape)
- [x] `GET /api/tracked-products`
- [x] `GET /api/tracked-products/:id`
- [x] `DELETE /api/tracked-products/:id`
- [x] `GET /api/tracked-products/:id/history`
- [x] `GET /api/tracked-products/:id/scrape-logs`
- [x] `POST /api/scrape/run` (protected, `202` + background)
- [x] `POST /api/scrape/:trackedProductId` (protected)
- [x] `GET /api/runs/:runId`
- [x] `GET /api/export.csv`

- [x] Centralized validation + error middleware + request ID.
- [x] Bearer-secret middleware (constant-time compare).
- [x] CORS limited to `FRONTEND_ORIGIN`.

## 9. Phase 6 — Headed CLI

- [x] `npm run scrape:headed -- --tracked-product-id <id>` → same scraper with `headless: false`, `slowMo`, writes real attempt rows (`trigger_source = demo`).
- [x] Optional `--simulate-timeout` flag that lowers the price-ready timeout to force a visible retry. Must be documented and labelled as a demo aid, not presented as a real store failure.

## 10. Phase 7 — Deploy Backend + Scheduler (do early)

### Render

- [x] Web service, root `backend/`.
- [x] Build: `npm install && npx playwright install --with-deps chromium`.
- [x] Start: `npm start`.
- [x] Env vars set.
- [x] `/api/health` OK; catalog synced 960/960.
- [x] Manual scrape succeeds on Render (check memory in Render metrics).

### cron-job.org

- [x] Warm-up job: `GET /api/health` every 10 minutes (was `55 1-23/2 * * *`; Render still slept every ~15 min, so it now never idles).
- [x] Backup monitor: UptimeRobot on `/api/health` every 5 minutes with email alerts.
- [x] Scrape job: `POST https://<render>.onrender.com/api/scrape/run`, header `Authorization: Bearer …`, `0 */2 * * *`.
- [ ] Enable failure notifications on both jobs.
- [x] Trigger once manually; confirm `202` and rows in `scrape_runs` / `scrape_attempts`.
- [x] Track 2–3 products so unattended history starts accumulating.

## 11. Phase 8 — Frontend (Next.js)

Read `frontend/AGENTS.md` first. Next.js 16 has breaking changes.

### Dashboard

- [x] `lib/api.js` using `NEXT_PUBLIC_API_BASE_URL`.
- [x] Search input + results.
- [x] Product detail + option selector.
- [x] Track button.
- [x] Tracked products table: current price, MRP, stock, last success, last outcome, failure count.
- [x] Per-product page: history chart (price + stock) and table.
- [x] Scrape log (all attempts, failures highlighted).
- [x] Export button → `/api/export.csv`.

### UX states

- [x] Loading (including Render cold start: "waking backend…")
- [x] Empty search / no results
- [x] No tracked products
- [x] API error
- [x] Never scraped
- [x] Last scrape failed (show last known good price with its timestamp)

### Vercel

- [x] Import repo, root `frontend/`, Next.js preset.
- [x] Set `NEXT_PUBLIC_API_BASE_URL`.
- [x] Update backend `FRONTEND_ORIGIN`.

## 12. Phase 9 — Production Validation

- [x] 2–3 products/options tracked.
- [x] Several scheduled (unattended) runs recorded.
- [ ] Chart/table data correct against the store in a browser.
- [x] Logs show retries/failures honestly.
- [x] CSV: failed/retried rows have blank price/stock; timestamps ISO UTC; opens in a spreadsheet.
- [x] Last successful state unchanged after a failure.

## 13. Phase 10 — Reliability Test Matrix

| Scenario | Expected result |
|---|---|
| Price loads normally | `success`, observation created |
| Navigation timeout | retry; if exhausted → `failed` |
| HTTP 429/5xx from store | retry with backoff; if exhausted → `failed` |
| Challenge/hover not accepted, price never appears | retry (re-hover / reload); if exhausted → `failed` (`CHALLENGE_TIMEOUT`) |
| Price still pending (dimmed) | keep waiting until timeout; never read |
| Manifest classes changed | fresh manifest + retry; persistent miss → `failed` (`STRUCTURE_CHANGED`) |
| Decoy `.price-value` present | ignored |
| Split price with zero-width chars | normalized correctly |
| Product sold out | `success` with stock 0 |
| Option no longer offered | `failed` immediately (`OPTION_NOT_FOUND`) |
| One target fails in batch | remaining targets continue |
| Duplicate cron trigger in same slot | `200 duplicate`, no new run |
| Backend asleep before scrape | kept awake by a 10-minute health ping; scrape call returns `202` within 30 s |
| Scheduler stops firing | `schedulerStale = true`, dashboard banner, cron-job.org email |
| Instance restarts mid-batch | stuck run closed as `failed` by next run |
| Stock text in any of the 5 wordings | integer extracted correctly |

## 14. Phase 11 — Headed Demo (2–4 min)

1. Show the live dashboard with tracked products and history.
2. Search for a product, select an option, track it.
3. Run `npm run scrape:headed` locally.
4. Show the product page, option selection, and the hover unlocking the price.
5. Show a slow/failing case and the retry. Use a real store failure if one occurs; otherwise use the documented `--simulate-timeout` flag and say so on camera.
6. Show the final outcome.
7. Refresh the dashboard: history + log.
8. Click Export and show the CSV (including a retried/failed row).

## 15. Phase 12 — Documentation

- [x] Docs updated with store inspection results.
- [x] `decision.md` design note: add real implementation-time AI mistakes and fixes.
- [ ] README setup tested from a clean clone.
- [x] README: live URLs filled in.

## 16. Final Submission Checklist

- [x] Live Vercel URL works.
- [x] Render API reachable.
- [x] Supabase contains tracked data.
- [x] 2–3 tracked products/options exist.
- [x] History contains real unattended/scheduled records.
- [x] Scrape log contains failures/retries where they happened.
- [x] CSV export works.
- [ ] Headed demo video recorded (2–4 min).
- [x] Public GitHub repository accessible.
- [x] README contains setup, schedule, env vars.
- [x] Design note explains reliability, trade-offs, AI mistakes/corrections.
- [ ] Resume PDF provided.

## 17. Priority Order Under Time Pressure

```text
P0  Playwright price/stock scraper + validation
P0  Retry + timeout + classification
P0  Honest attempt logging
P0  Supabase persistence
P0  Deploy backend + cron (start unattended runs early)
P0  2–3 tracked targets
P0  Catalog sync + search
P0  Minimal dashboard: search, track, history, log, export
P0  Headed demo
P1  Dashboard polish
P1  CI (GitHub Actions: lint + unit tests)
P2  Alerts
P2  Structure-change flag in UI
P2  Configurable frequency / multi-option scrape
```

Do not spend time on P2 items while P0 reliability is incomplete.
