-- Phase 2: shipment-level freight allocation

create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  shipment_ref text not null unique,
  supplier_id uuid references public.suppliers(id) on delete set null,
  status text not null default 'Planning' check (status in ('Planning','Quoted','Booked','In Transit','Received','Cancelled')),
  shipping_method text,
  freight_amount numeric(12,2) not null default 0 check (freight_amount >= 0),
  freight_currency text not null default 'USD' check (freight_currency in ('USD','CAD')),
  usd_cad_rate numeric(10,4) not null default 1.38 check (usd_cad_rate > 0),
  allocation_method text not null default 'weight' check (allocation_method in ('weight','volume','value','quantity','equal','manual')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shipment_items (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quote_id uuid references public.quotes(id) on delete set null,
  quantity numeric(12,3) not null default 1 check (quantity > 0),
  manual_allocation_cad numeric(12,2) check (manual_allocation_cad >= 0),
  allocated_freight_cad numeric(12,2) check (allocated_freight_cad >= 0),
  allocated_freight_per_unit_cad numeric(12,4) check (allocated_freight_per_unit_cad >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shipment_id, product_id, quote_id)
);

create index if not exists idx_shipments_supplier_id on public.shipments(supplier_id);
create index if not exists idx_shipment_items_shipment_id on public.shipment_items(shipment_id);
create index if not exists idx_shipment_items_product_id on public.shipment_items(product_id);
create index if not exists idx_shipment_items_quote_id on public.shipment_items(quote_id);

alter table public.shipments enable row level security;
alter table public.shipment_items enable row level security;

drop policy if exists "members all shipments" on public.shipments;
create policy "members all shipments" on public.shipments for all to authenticated
using (exists (select 1 from public.app_members m where m.user_id = (select auth.uid())))
with check (exists (select 1 from public.app_members m where m.user_id = (select auth.uid())));

drop policy if exists "members all shipment items" on public.shipment_items;
create policy "members all shipment items" on public.shipment_items for all to authenticated
using (exists (select 1 from public.app_members m where m.user_id = (select auth.uid())))
with check (exists (select 1 from public.app_members m where m.user_id = (select auth.uid())));

grant select, insert, update, delete on public.shipments to authenticated;
grant select, insert, update, delete on public.shipment_items to authenticated;
revoke all on public.shipments from anon;
revoke all on public.shipment_items from anon;

drop trigger if exists trg_shipments_updated_at on public.shipments;
create trigger trg_shipments_updated_at before update on public.shipments
for each row execute function public.set_updated_at();

drop trigger if exists trg_shipment_items_updated_at on public.shipment_items;
create trigger trg_shipment_items_updated_at before update on public.shipment_items
for each row execute function public.set_updated_at();
