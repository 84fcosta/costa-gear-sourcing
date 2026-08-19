-- Phase 3: link buying decisions to logistics
alter table public.shipments
  add column if not exists purchase_order_id uuid references public.purchase_orders(id) on delete set null;

create index if not exists idx_shipments_purchase_order_id
  on public.shipments(purchase_order_id);
