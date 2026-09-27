-- Price tracker schema (docs/database.md §9). Safe to re-run.
create extension if not exists pgcrypto;

create table if not exists catalog_products (
  store_product_id integer primary key,
  slug             text not null,
  name             text not null,
  brand            text,
  category         text,
  sku              text,
  last_seen_at     timestamptz not null default now()
);

create table if not exists tracked_products (
  id                   uuid primary key default gen_random_uuid(),
  store_product_id     integer not null,
  product_name         text not null,
  product_url          text not null,
  option_axis          text,
  selected_option      text not null,
  selected_option_key  text not null,
  active               boolean not null default true,
  current_price        numeric(12,2) check (current_price > 0),
  current_mrp          numeric(12,2) check (current_mrp > 0),
  currency             text,
  current_stock_qty    integer check (current_stock_qty >= 0),
  last_success_at      timestamptz,
  last_attempt_at      timestamptz,
  last_outcome         text check (last_outcome in ('success','retried','failed')),
  consecutive_failures integer not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Only one ACTIVE target per product+option; a soft-deleted target can be re-tracked
-- (the API reactivates the existing row instead of inserting a new one).
create unique index if not exists uq_tracked_active_target
  on tracked_products (store_product_id, selected_option_key)
  where active;

create table if not exists scrape_runs (
  id             uuid primary key default gen_random_uuid(),
  run_key        text not null unique,
  trigger_source text not null check (trigger_source in ('cron','manual','initial','demo')),
  status         text not null default 'running'
                 check (status in ('running','completed','partial','failed')),
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  target_count   integer not null default 0,
  success_count  integer not null default 0,
  failure_count  integer not null default 0
);

create table if not exists scrape_attempts (
  id                  uuid primary key default gen_random_uuid(),
  run_id              uuid not null references scrape_runs(id),
  tracked_product_id  uuid not null references tracked_products(id),
  attempt_number      integer not null check (attempt_number >= 1),
  started_at          timestamptz not null,
  finished_at         timestamptz,
  duration_ms         integer,
  outcome             text not null check (outcome in ('success','retried','failed')),
  method              text not null default 'browser' check (method in ('browser','http')),
  http_status         integer,
  error_code          text,
  error_message       text,
  manifest_revision   integer,
  raw_price_text      text,
  raw_stock_text      text,
  extracted_price     numeric(12,2),
  extracted_stock_qty integer,
  unique (tracked_product_id, run_id, attempt_number),
  -- price/stock present if and only if success
  check (
    (outcome = 'success'  and extracted_price > 0 and extracted_stock_qty >= 0)
    or
    (outcome <> 'success' and extracted_price is null and extracted_stock_qty is null)
  )
);

create table if not exists price_observations (
  id                 uuid primary key default gen_random_uuid(),
  tracked_product_id uuid not null references tracked_products(id),
  scrape_attempt_id  uuid not null unique references scrape_attempts(id),
  price              numeric(12,2) not null check (price > 0),
  mrp                numeric(12,2) check (mrp > 0),
  currency           text not null,
  stock_qty          integer not null check (stock_qty >= 0),
  captured_at        timestamptz not null
);

create index if not exists idx_catalog_name on catalog_products (lower(name));
create index if not exists idx_tracked_active on tracked_products (active);
create index if not exists idx_obs_target_time on price_observations (tracked_product_id, captured_at desc);
create index if not exists idx_attempts_target_time on scrape_attempts (tracked_product_id, started_at desc);
create index if not exists idx_attempts_run on scrape_attempts (run_id);

-- Server-side access only: enable RLS with no policies so the public anon key can read nothing.
alter table catalog_products   enable row level security;
alter table tracked_products   enable row level security;
alter table scrape_runs        enable row level security;
alter table scrape_attempts    enable row level security;
alter table price_observations enable row level security;
