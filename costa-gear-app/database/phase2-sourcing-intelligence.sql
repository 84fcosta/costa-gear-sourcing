-- Phase 2: sourcing intelligence foundation
-- Applied to production on 2026-08-18.

create table if not exists public.market_prices (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  source_name text not null,
  source_url text,
  price_cad numeric(12,2) not null check (price_cad >= 0),
  observed_at date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.supplier_scorecards (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null unique references public.suppliers(id) on delete cascade,
  quality_score numeric(3,2) check (quality_score between 1 and 5),
  responsiveness_score numeric(3,2) check (responsiveness_score between 1 and 5),
  commercial_score numeric(3,2) check (commercial_score between 1 and 5),
  logistics_score numeric(3,2) check (logistics_score between 1 and 5),
  last_reviewed_at date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_market_prices_product_observed_at
  on public.market_prices(product_id, observed_at desc);

alter table public.market_prices enable row level security;
alter table public.supplier_scorecards enable row level security;

drop policy if exists "members all market prices" on public.market_prices;
create policy "members all market prices"
on public.market_prices
for all
to authenticated
using (exists (select 1 from public.app_members m where m.user_id = (select auth.uid())))
with check (exists (select 1 from public.app_members m where m.user_id = (select auth.uid())));

drop policy if exists "members all supplier scorecards" on public.supplier_scorecards;
create policy "members all supplier scorecards"
on public.supplier_scorecards
for all
to authenticated
using (exists (select 1 from public.app_members m where m.user_id = (select auth.uid())))
with check (exists (select 1 from public.app_members m where m.user_id = (select auth.uid())));

drop trigger if exists trg_market_prices_updated_at on public.market_prices;
create trigger trg_market_prices_updated_at before update on public.market_prices
for each row execute function public.set_updated_at();

drop trigger if exists trg_supplier_scorecards_updated_at on public.supplier_scorecards;
create trigger trg_supplier_scorecards_updated_at before update on public.supplier_scorecards
for each row execute function public.set_updated_at();
