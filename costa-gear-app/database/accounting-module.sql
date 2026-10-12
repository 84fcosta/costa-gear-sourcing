-- Costa Gear Accounting module
-- Stores only planning baselines and owner-only adjustments.
-- Actual accounting activity is derived from operational source tables.

begin;

create table if not exists public.accounting_forecast_months (
  id uuid primary key default gen_random_uuid(),
  forecast_year integer not null check (forecast_year between 2020 and 2100),
  scenario text not null default 'Baseline' check (length(trim(scenario)) > 0),
  month smallint not null check (month between 1 and 12),
  line_code text not null check (length(trim(line_code)) > 0),
  amount_cad numeric(14,2) not null default 0 check (amount_cad >= 0),
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounting_forecast_months_unique unique (forecast_year, scenario, month, line_code)
);

create index if not exists accounting_forecast_months_year_scenario_idx
  on public.accounting_forecast_months(forecast_year, scenario);

alter table public.accounting_forecast_months enable row level security;

drop policy if exists "members all accounting forecast months" on public.accounting_forecast_months;
create policy "members all accounting forecast months"
on public.accounting_forecast_months
for all
to authenticated
using (
  exists (
    select 1
    from public.app_members m
    where m.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.app_members m
    where m.user_id = (select auth.uid())
  )
);

grant select, insert, update, delete on public.accounting_forecast_months to authenticated;
grant select, insert, update, delete on public.accounting_forecast_months to service_role;

create table if not exists public.accounting_owner_transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_date date not null,
  transaction_type text not null check (transaction_type in ('Contribution','Draw')),
  amount_cad numeric(14,2) not null check (amount_cad > 0),
  description text not null check (length(trim(description)) > 0),
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists accounting_owner_transactions_date_idx
  on public.accounting_owner_transactions(transaction_date desc);

alter table public.accounting_owner_transactions enable row level security;

drop policy if exists "members all accounting owner transactions" on public.accounting_owner_transactions;
create policy "members all accounting owner transactions"
on public.accounting_owner_transactions
for all
to authenticated
using (
  exists (
    select 1
    from public.app_members m
    where m.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.app_members m
    where m.user_id = (select auth.uid())
  )
);

grant select, insert, update, delete on public.accounting_owner_transactions to authenticated;
grant select, insert, update, delete on public.accounting_owner_transactions to service_role;

commit;
