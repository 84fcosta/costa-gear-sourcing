alter table public.products
  add column if not exists planning_lead_time_days integer,
  add column if not exists safety_stock_days integer not null default 14,
  add column if not exists order_cycle_days integer not null default 30,
  add column if not exists preferred_supplier_id uuid references public.suppliers(id) on delete set null;

alter table public.products
  drop constraint if exists products_planning_lead_time_days_check,
  add constraint products_planning_lead_time_days_check check (planning_lead_time_days is null or planning_lead_time_days >= 0),
  drop constraint if exists products_safety_stock_days_check,
  add constraint products_safety_stock_days_check check (safety_stock_days >= 0),
  drop constraint if exists products_order_cycle_days_check,
  add constraint products_order_cycle_days_check check (order_cycle_days >= 1);

create index if not exists idx_products_preferred_supplier_id
  on public.products(preferred_supplier_id);
