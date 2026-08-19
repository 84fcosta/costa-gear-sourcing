-- Phase 2: buying decisions and purchase orders
-- Applied to production on 2026-08-18.

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_ref text not null unique,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  status text not null default 'Draft' check (status in ('Draft','Planned','Approved','Ordered','Partially Received','Received','Cancelled')),
  order_date date,
  expected_delivery_date date,
  currency text not null default 'USD' check (currency in ('USD','CAD')),
  usd_cad_rate numeric(12,6) not null default 1.38 check (usd_cad_rate > 0),
  incoterm text,
  payment_terms text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quote_id uuid references public.quotes(id) on delete set null,
  quantity integer not null check (quantity > 0),
  moq_text text,
  supplier_sku text,
  unit_price_usd numeric(12,4),
  landed_cost_per_unit_cad numeric(12,4),
  target_sell_price_cad numeric(12,2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;

drop policy if exists "members all purchase orders" on public.purchase_orders;
create policy "members all purchase orders" on public.purchase_orders for all to authenticated
using (exists (select 1 from public.app_members m where m.user_id = (select auth.uid())))
with check (exists (select 1 from public.app_members m where m.user_id = (select auth.uid())));

drop policy if exists "members all purchase order items" on public.purchase_order_items;
create policy "members all purchase order items" on public.purchase_order_items for all to authenticated
using (exists (select 1 from public.app_members m where m.user_id = (select auth.uid())))
with check (exists (select 1 from public.app_members m where m.user_id = (select auth.uid())));

grant select, insert, update, delete on public.purchase_orders, public.purchase_order_items to authenticated;
revoke all on public.purchase_orders, public.purchase_order_items from anon;

create index if not exists idx_purchase_orders_supplier_id on public.purchase_orders(supplier_id);
create index if not exists idx_purchase_order_items_po_id on public.purchase_order_items(purchase_order_id);
create index if not exists idx_purchase_order_items_product_id on public.purchase_order_items(product_id);
