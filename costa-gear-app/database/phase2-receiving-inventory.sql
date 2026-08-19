-- Phase 2: receiving & inventory
-- Applied to production on 2026-08-18.

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_ref text not null unique,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  received_date date,
  status text not null default 'Draft' check (status in ('Draft','Posted','Cancelled')),
  location text,
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  purchase_order_item_id uuid not null references public.purchase_order_items(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity_received integer not null default 0 check (quantity_received >= 0),
  quantity_damaged integer not null default 0 check (quantity_damaged >= 0),
  quantity_rejected integer not null default 0 check (quantity_rejected >= 0),
  actual_landed_cost_per_unit_cad numeric(12,4) check (actual_landed_cost_per_unit_cad >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (receipt_id, purchase_order_item_id),
  check (quantity_damaged + quantity_rejected <= quantity_received)
);

alter table public.receipts enable row level security;
alter table public.receipt_items enable row level security;

create policy "members all receipts" on public.receipts
for all to authenticated
using (exists (select 1 from public.app_members m where m.user_id = (select auth.uid())))
with check (exists (select 1 from public.app_members m where m.user_id = (select auth.uid())));

create policy "members all receipt items" on public.receipt_items
for all to authenticated
using (exists (select 1 from public.app_members m where m.user_id = (select auth.uid())))
with check (exists (select 1 from public.app_members m where m.user_id = (select auth.uid())));

grant select, insert, update, delete on public.receipts to authenticated;
grant select, insert, update, delete on public.receipt_items to authenticated;
revoke all on public.receipts from anon;
revoke all on public.receipt_items from anon;
