# Research Notes

## 1. Source Hierarchy

This document separates three categories:

1. **Assignment facts:** directly required by the supplied PDF.
2. **Target-store facts:** verified by inspecting https://demo.inelabteamdev.com on 2026-09-25.
3. **External technical guidance:** official documentation.

Project decisions based on these live in `decision.md`.

## 2. Assignment Facts

The brief requires:

- React or Vue frontend on Vercel.
- Node.js/Express or Django backend on Render.
- Supabase PostgreSQL.
- Scraping via lightweight HTTP + HTML parsing where possible, with Playwright/Puppeteer only where genuinely needed.
- Scraping every 2 hours, triggered externally (free-tier backends sleep).
- Retries and handling for slow/error responses; recover when a page shifts; never store incorrect data.
- Price and stock history.
- Per-product scrape logs with outcome `success` / `retried` / `failed`.
- CSV export: product ID (from product page URL), name, option, ISO 8601 UTC timestamp, price, stock, outcome; failed rows with blank price/stock.
- A headed scraper run and a 2–4 minute screen recording showing slow/failing handling.
- At least 2–3 tracked products in the live dashboard, with history from real unattended runs.
- Public GitHub repository, live site, README (setup, schedule, env vars), design note (reliability, trade-offs, what AI got wrong), resume PDF.

## 3. Target-Store Inspection (2026-09-25)

Method: `curl` of the HTML, the JS bundle (`/assets/index-*.js`) and the JSON endpoints it calls. Findings below are observed facts. Items marked *(from bundle)* were read from the client code and should be confirmed in a headed browser.

### 3.1 Site shape

- The HTML at `/` is a ~460-byte shell (`<div id="root">` + one module script): a client-rendered React SPA.
- Client routes: `/` (catalog) and `/item/:id` (product page).
- Responses from the JSON API were fast (~0.1 s) and all `200` during inspection. The brief says slow/error responses happen occasionally, so they must still be handled.

### 3.2 JSON endpoints

| Endpoint | Returns | Notes |
|---|---|---|
| `GET /api/v2/listings?page=N&limit=L` | `{ page, perPage, totalPages, count, results[] }`, where each result has `id, slug, name, brand, category, sku, description` | `count` = 960. `limit` capped at 60. **No search param** (`q` ignored). **Order is randomized per request.** |
| `GET /api/v2/items/:id` | `id, slug, name, brand, category, sku, description, specs{…}, reviews[], optionAxis, options[{id,label}]` | **No price, no stock.** Example: `optionAxis: "Finish"`, options `o1: Oak`, `o2: Walnut`. |
| `GET /api/v2/ui/manifest` | `revision, variant, validUntil, classes{priceWrap, priceValue, mrp, sale, badge, rating, seller, delivery, stock}, order[], priceTag, priceCarrier, …` | Obfuscated class names (e.g. `priceValue: "xsu-j2"`) that change with the revision. |

**Pagination experiment:** fetching page 1 twice returned different products. One full pass over all 16 pages (limit 60) produced only **617 unique IDs out of 960**. Search must use a deduplicated cache built from repeated passes.

### 3.3 Price and stock loading *(from bundle)*

The price is not fetched on page load. The page:

1. Fetches a challenge.
2. Computes a proof-of-work in the browser.
3. POSTs the solution together with hover telemetry: mouse-move samples, hover start, dwell time, and whether events were trusted. There is a minimum move count and dwell time.
4. Receives a `pass` token. A `429` is possible here.
5. Fetches the price for the product + option with `Authorization: <scheme> <pass>` and decodes the payload with the pass. `401`/`403` → challenge failed.

UI messages while waiting: *"Hover over the price area to load the current price."* and *"Hold on — checking availability…"*.

Conclusion: price/stock **require a real browser with real (Playwright) mouse input**. This is the "page genuinely requires it" case.

### 3.4 Anti-scraping traps in the product page *(from bundle)*

- **Decoy price:** a hidden `<span class="price-value" aria-hidden="true" style="display:none">` holding a fake value. Never read it.
- **Rotating classes:** the real price element is `<{manifest.priceTag}>` (e.g. `output`) with class `manifest.classes.priceValue`.
- **Split price text:** with `priceCarrier: "split"` the price text can be broken up with zero-width spaces (`​`) and NBSP. Normalize before parsing.
- **Pending state:** while (re)loading, the price is shown with `opacity: 0.45`. Reading it then gives a stale value (e.g. the previous option's price).
- **Multiple prices:** MRP (line-through, class `mrp`), sometimes a sale/member price (class `sale`), and the main price.
- **Currency formatting:** `Intl.NumberFormat('en-IN', { style: 'currency' })`, so Indian digit grouping (e.g. `₹1,29,999.00`). The currency code comes from the payload (expected INR).
- **Stock:** `stock > 0` → pill `.avail-yes` with the count in one of five rotating wordings: `N units available`, `Last few: N`, `Available (N)`, `Stock: N remaining`, `Ready to ship · N available` (chosen by `N % 5`). Otherwise `.avail-no` "Sold out".
- **Flaky handlers:** some UI event handlers are wrapped so that ~35% of the time the event is either dropped or delayed by 900 ms. Hover/click may need to be repeated.

### 3.4.1 Confirmed in a real browser during implementation (2026-09-25)

- **Unlock button:** hovering alone does not load the price. Hovering enables a `Check today's price` button (`.offer-panel button.ctl-main`, disabled until the hover check passes); clicking it runs `GET/POST /api/v2/handshake` then `GET /api/v2/items/:id/quote?opt=<key>`. The panel goes `offer-locked` → loading ("Loading current price…") → `offer-ready`.
- **Cookie-consent overlay:** a `.consent-scrim` modal (Allow / Reject) appears ~3 s after load on some page loads and intercepts all pointer events, so hover and clicks silently do nothing. The scraper clicks **Reject**.
- **Default option varies:** the preselected option is not always the first (e.g. `Duo` of Solo/Duo/Family). Option chips are `.opt-picker .opt-chip` with `aria-pressed="true"` on the active one.
- **Second decoy:** besides `.price-value`, a hidden `<span class="amount" data-price="true" aria-hidden="true" style="display:none">` holds another fake price.
- **Split price in practice:** `<output class="… xsu-j2">` contains one `<span>` per character interleaved with `U+200B` and NBSP.
- A full catalog sync needed 8 passes of 16 pages to reach 960/960 (pass 1: 603).

### 3.5 Product ID for CSV

Product URL is `https://demo.inelabteamdev.com/item/2765`, so `product_id = 2765` (numeric `id`, same as in the API).

## 4. External Research Findings

### Express

Middleware + routing composition; error middleware after routes. Express 5 forwards rejected promises from async handlers to error middleware.

- https://expressjs.com/en/guide/using-middleware.html
- https://expressjs.com/en/guide/error-handling.html
- https://expressjs.com/en/guide/routing.html

### Playwright

Locators with auto-waiting are the core abstraction. `page.mouse.move(x, y, { steps })` generates trusted input events, which the store's hover check requires.

- https://playwright.dev/docs/locators
- https://playwright.dev/docs/api/class-mouse

### Render

Free web services sleep after ~15 minutes without traffic and cold-start on the next request. Free instances have 512 MB RAM. Cron Jobs are a separate paid service type. Playwright needs `npx playwright install --with-deps chromium` at build time.

- https://render.com/docs/free
- https://render.com/docs/cronjobs

### cron-job.org

Free external scheduler; requests time out after ~30 s, so the endpoint must return quickly and work in the background.

- https://cron-job.org/

### Supabase

The direct database host is IPv6 by default. Platforms without IPv6 (Render) should use the Supavisor **session pooler** connection string. RLS should be enabled on exposed-schema tables.

- https://supabase.com/docs/guides/database/connecting-to-postgres
- https://supabase.com/docs/guides/database/postgres/row-level-security

### Next.js

The frontend is Next.js 16. Only `NEXT_PUBLIC_*` env vars reach the browser. Version 16 has breaking changes. Consult the bundled docs in `frontend/node_modules/next/dist/docs/`.

- https://nextjs.org/docs

## 5. Why the Chosen Architecture Fits

- **HTTP where possible, browser where required.** Catalog/options/manifest are plain JSON. Only price/stock need Playwright. This follows the brief's preference exactly.
- **Explicit validation.** The dangerous failure is not "the request failed" but "the page loaded and we read the decoy, a stale price, or the wrong option". Validation is part of the success condition.
- **Append-only attempt history.** Every attempt is a row, so reviewers can distinguish transient failures, retries and final failures.
- **Modularity without microservices.** Internal modules give most of the benefit without another deployment.

## 6. Research Questions

| Question | Status |
|---|---|
| How is search done? | Resolved: no server search; cache the catalog |
| Does option selection change the DOM or trigger a request? | Partly resolved: the price request is per product + option. Confirm the UI control in headed mode |
| Is price in HTML, JSON, or async? | Resolved: async, browser-only, gated |
| How is stock represented? | Resolved: unit count / "Sold out" |
| Can an option be priced without a browser? | Resolved: no (without reverse-engineering the challenge) |
| What failures can be reproduced for the video? | Open: observe during headed runs |
| How often does the manifest revision change? | Open |
| Do fixtures capture enough variants? | Open: save DOM snapshots for split/non-split price, sale/no-sale, sold out |

## 7. Validation Evidence to Keep Before Submission

- successful browser scrape (screenshot + log row)
- retry after timeout/challenge failure
- final failure path, with current price unchanged
- CSV export including a retried/failed row with blank price/stock
- scheduled runs executed by cron-job.org (cron-job.org history + `scrape_runs`)
- 2–3 tracked products visible on the live dashboard
- catalog sync reporting 960/960
