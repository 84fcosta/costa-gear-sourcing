-- Phase 4: sales & inventory commitment
-- Applied to production on 2026-08-19.

create table if not exists public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  sale_ref text not null unique,
  channel text not null default 'Marketplace' check (channel in ('Marketplace','Website','Amazon','Direct','Other')),
  status text not null default 'Draft' check (status in ('Draft','Confirmed','Paid','Shipped','Completed','Cancelled','Returned')),
  sold_date date,
  customer_name text,
  payment_fee_cad numeric(12,2) not null default 0 check (payment_fee_cad >= 0),
  outbound_shipping_cad numeric(12,2) not null default 0 check (outbound_shipping_cad >= 0),
  other_costs_cad numeric(12,2) not null default 0 check (other_costs_cad >= 0),
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales_order_items (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references public.sales_orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity integer not null default 1 check (quantity > 0),
  unit_sell_price_cad numeric(12,2) not null check (unit_sell_price_cad >= 0),
  unit_cost_cad numeric(12,4) check (unit_cost_cad >= 0),
  discount_cad numeric(12,2) not null default 0 check (discount_cad >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sales_order_id, product_id)
);

create index if not exists idx_sales_orders_status on public.sales_orders(status);
create index if not exists idx_sales_orders_sold_date on public.sales_orders(sold_date desc);
create index if not exists idx_sales_order_items_sales_order_id on public.sales_order_items(sales_order_id);
create index if not exists idx_sales_order_items_product_id on public.sales_order_items(product_id);

alter table public.sales_orders enable row level security;
alter table public.sales_order_items enable row level security;

create policy "members all sales orders" on public.sales_orders
for all to authenticated
using (exists (select 1 from public.app_members m where m.user_id = (select auth.uid())))
with check (exists (select 1 from public.app_members m where m.user_id = (select auth.uid())));

create policy "members all sales order items" on public.sales_order_items
for all to authenticated
using (exists (select 1 from public.app_members m where m.user_id = (select auth.uid())))
with check (exists (select 1 from public.app_members m where m.user_id = (select auth.uid())));

grant select, insert, update, delete on public.sales_orders to authenticated;
grant select, insert, update, delete on public.sales_order_items to authenticated;
revoke all on public.sales_orders from anon;
revoke all on public.sales_order_items from anon;

drop trigger if exists trg_sales_orders_updated_at on public.sales_orders;
create trigger trg_sales_orders_updated_at before update on public.sales_orders
for each row execute function public.set_updated_at();

drop trigger if exists trg_sales_order_items_updated_at on public.sales_order_items;
create trigger trg_sales_order_items_updated_at before update on public.sales_order_items
for each row execute function public.set_updated_at();
