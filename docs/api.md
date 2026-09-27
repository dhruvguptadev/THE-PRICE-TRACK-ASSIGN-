# API Documentation

## 1. API Overview

Base URL:

```text
https://price-tracker-api-rqd5.onrender.com/api
```

Local:

```text
http://localhost:3000/api
```

REST-style JSON over HTTPS in production. CORS allows only `FRONTEND_ORIGIN`.

## 2. Authentication Model

Dashboard read endpoints and tracking CRUD are unauthenticated for the assignment.

Protected with a bearer secret:

- `POST /api/scrape/run` (scheduler)
- `POST /api/scrape/:trackedProductId` (manual scrape)
- `POST /api/catalog/sync`

```http
Authorization: Bearer <SCRAPE_TRIGGER_SECRET>
```

The secret exists only in cron-job.org and the backend environment, never in the frontend.

## 3. Standard Response Shape

Success:

```json
{
  "data": {},
  "meta": {}
}
```

Error:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request.",
    "details": {},
    "requestId": "req_123"
  }
}
```

## 4. Endpoints

### GET `/api/health`

Deployment health check. Also the keep-awake target: cron-job.org pings it every 10 minutes and UptimeRobot every 5. `schedulerStale` is `true` when no cron run has started in the last 2 h 30 min; the dashboard shows a warning when it is.

```json
{
  "data": {
    "status": "ok",
    "service": "price-tracker-api",
    "db": "ok",
    "catalog": { "count": 960, "complete": true },
    "scheduler": {
      "lastCronRunAt": "2026-09-25T10:00:01.000Z",
      "lastCronRunStatus": "completed",
      "schedulerStale": false
    },
    "timestamp": "2026-09-25T12:00:00.000Z"
  }
}
```

### GET `/api/products/search`

Search the **local catalog cache** (`catalog_products`) by partial or full product name (and brand). The store's own listing API has no working search and returns a random order per request, so it is not searched live.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `q` | string | yes | 1–100 characters |
| `limit` | integer | no | Default 10, max 25 |

```http
GET /api/products/search?q=filing&limit=10
```

```json
{
  "data": {
    "items": [
      {
        "storeProductId": 2765,
        "name": "Halvard Filing Cabinet Aero",
        "brand": "Halvard",
        "category": "Office",
        "url": "https://demo.inelabteamdev.com/item/2765"
      }
    ]
  },
  "meta": { "catalogComplete": true }
}
```

### GET `/api/products/:storeProductId`

Live product detail from the store's `/api/v2/items/:id` (plain HTTP), used to choose an option before tracking. Price is not included: the store does not expose it without the browser challenge.

```json
{
  "data": {
    "storeProductId": 2765,
    "name": "Halvard Filing Cabinet Aero",
    "brand": "Halvard",
    "category": "Office",
    "sku": "SK-2765-HA",
    "url": "https://demo.inelabteamdev.com/item/2765",
    "optionAxis": "Finish",
    "options": [
      { "key": "o1", "label": "Oak" },
      { "key": "o2", "label": "Walnut" }
    ],
    "specs": { "warranty": "1 year manufacturer warranty", "material": "Solid beech" }
  }
}
```

### POST `/api/catalog/sync` (protected)

Refresh `catalog_products` from the store listings (repeated passes until all unique IDs are collected). Runs automatically on startup when the catalog is empty.

```json
{ "data": { "count": 960, "fetched": 960, "complete": true, "passes": 3 } }
```

### POST `/api/tracked-products`

Create a tracked product option.

```json
{
  "storeProductId": 2765,
  "selectedOptionKey": "o1"
}
```

The server looks up the product via `/api/v2/items/:id`, checks the option exists, and stores name, URL, option axis and label from the store. It does not trust names sent by the client. An initial scrape is queued in the background.

Response `201`:

```json
{
  "data": {
    "id": "5f1c…",
    "storeProductId": 2765,
    "productName": "Halvard Filing Cabinet Aero",
    "optionAxis": "Finish",
    "selectedOption": "Oak",
    "selectedOptionKey": "o1",
    "active": true,
    "createdAt": "2026-09-25T12:00:00.000Z"
  }
}
```

- `400` unknown product or option key
- `409` the same product+option is already actively tracked
- If a previously deactivated target exists, it is reactivated (`200`) and keeps its history.

### GET `/api/tracked-products`

List tracked products with current state.

Query: `active=true|false`, `limit`, `offset`.

```json
{
  "data": {
    "items": [
      {
        "id": "5f1c…",
        "storeProductId": 2765,
        "productName": "Halvard Filing Cabinet Aero",
        "selectedOption": "Oak",
        "currentPrice": 12999.00,
        "currentMrp": 15999.00,
        "currency": "INR",
        "stockQty": 7,
        "lastSuccessAt": "2026-09-25T10:00:12.000Z",
        "lastAttemptAt": "2026-09-25T10:00:12.000Z",
        "lastOutcome": "success",
        "consecutiveFailures": 0
      }
    ]
  },
  "meta": { "limit": 25, "offset": 0, "total": 3 }
}
```

### GET `/api/tracked-products/:id`

A tracked product plus current state and summary counts (attempts, successes, failures).

### DELETE `/api/tracked-products/:id`

Soft delete (`active=false`). History and logs remain and are still exported.

```json
{ "data": { "id": "5f1c…", "active": false } }
```

### GET `/api/tracked-products/:id/history`

Successful observations only, ordered by `capturedAt` ascending.

| Parameter | Type | Required |
|---|---|---|
| `from` | ISO timestamp | no |
| `to` | ISO timestamp | no |
| `limit` | integer | no |

```json
{
  "data": {
    "items": [
      {
        "capturedAt": "2026-09-25T10:00:12.000Z",
        "price": 12999.00,
        "mrp": 15999.00,
        "currency": "INR",
        "stockQty": 7
      }
    ]
  }
}
```

### GET `/api/tracked-products/:id/scrape-logs`

Every attempt, including retries and failures, newest first.

```json
{
  "data": {
    "items": [
      {
        "runId": "8a2e…",
        "runKey": "cron-2026-09-25T10",
        "attemptNumber": 1,
        "startedAt": "2026-09-25T10:00:01.000Z",
        "finishedAt": "2026-09-25T10:00:21.000Z",
        "outcome": "retried",
        "errorCode": "CHALLENGE_TIMEOUT",
        "errorMessage": "Price did not load within 20000 ms"
      },
      {
        "runId": "8a2e…",
        "runKey": "cron-2026-09-25T10",
        "attemptNumber": 2,
        "startedAt": "2026-09-25T10:00:24.000Z",
        "finishedAt": "2026-09-25T10:00:31.000Z",
        "outcome": "success",
        "price": 12999.00,
        "stockQty": 7,
        "errorCode": null,
        "errorMessage": null
      }
    ]
  }
}
```

### POST `/api/scrape/run` (protected)

Scheduler endpoint. Scrapes all active tracked products.

```http
POST /api/scrape/run
Authorization: Bearer <SCRAPE_TRIGGER_SECRET>
```

Returns immediately and runs the batch in the background, because cron-job.org times out after ~30 s and a cold start plus Playwright takes longer.

- `202` new run started for the current 2-hour slot:

```json
{ "data": { "runId": "8a2e…", "runKey": "cron-2026-09-25T10", "status": "running", "targets": 3 } }
```

- `200` a run for this slot already exists (duplicate trigger, nothing started):

```json
{ "data": { "runKey": "cron-2026-09-25T10", "status": "completed", "duplicate": true } }
```

- `409` a batch is currently running in this instance.

### POST `/api/scrape/:trackedProductId` (protected)

Manual scrape of one target (new `manual-<uuid>` run). Returns `202` with the run id. Headed mode is **not** available over HTTP. It is a local CLI command (`npm run scrape:headed`), because Render has no display.

### GET `/api/runs/:runId`

Run summary (status, counts), used to poll a manual run.

```json
{
  "data": {
    "runId": "8a2e…",
    "runKey": "cron-2026-09-25T10",
    "status": "partial",
    "targets": 3,
    "successes": 2,
    "failures": 1,
    "attempts": 5
  }
}
```

### GET `/api/export.csv`

Download all scrape attempts as CSV.

```http
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="scrape-history.csv"
```

```text
product_id,product_name,selected_option,timestamp,price,stock,outcome
2765,Halvard Filing Cabinet Aero,Oak,2026-09-25T10:00:01.000Z,,,retried
2765,Halvard Filing Cabinet Aero,Oak,2026-09-25T10:00:24.000Z,12999.00,7,success
```

- `product_id` is the numeric ID from `/item/<id>`
- `stock` is the unit count (0 = sold out)
- retried/failed rows have blank price and stock
- fields are CSV-escaped (names may contain commas/quotes)

## 5. HTTP Status Codes

| Status | Use |
|---|---|
| 200 | Successful read, reactivation, or duplicate-slot trigger |
| 201 | Resource created |
| 202 | Scrape run accepted and running in background |
| 400 | Invalid input |
| 401 | Missing/invalid bearer secret |
| 404 | Resource not found |
| 409 | Duplicate tracking target / batch already running |
| 500 | Unexpected server error |
| 502 | Store API failed while serving a live request (e.g. product detail) |

## 6. Scraper Outcome Semantics

`outcome` is recorded per attempt:

- `success`: validated extraction; observation persisted
- `retried`: this attempt failed and another attempt followed
- `failed`: final attempt failed; no observation persisted

```text
attempt 1 → retried
attempt 2 → retried
attempt 3 → failed
```

or:

```text
attempt 1 → retried
attempt 2 → success
```

## 7. API Security Rules

- Reject protected calls without the configured secret (constant-time compare).
- Never expose database credentials or Supabase service keys to the frontend.
- The client only sends `storeProductId` + option key. URLs are built server-side from `TARGET_STORE_BASE_URL`, so arbitrary URLs cannot be scraped.
- Limit search query length.
- Stream the CSV if the dataset grows.

## 8. Express Route Layout

```text
src/routes/
├── health.routes.js
├── products.routes.js     search, detail
├── catalog.routes.js      sync
├── tracking.routes.js     CRUD, history, scrape-logs
├── scrape.routes.js       run, manual, runs/:id
└── export.routes.js
```

Keep business logic in `services/`, not in route files. [Express routing](https://expressjs.com/en/guide/routing.html)
