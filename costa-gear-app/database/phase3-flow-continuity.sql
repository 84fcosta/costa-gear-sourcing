-- Phase 3: continuous flow links
alter table public.shipments
  add column if not exists purchase_order_id uuid references public.purchase_orders(id) on delete set null;
create index if not exists idx_shipments_purchase_order_id on public.shipments(purchase_order_id);

alter table public.shipment_items
  add column if not exists purchase_order_item_id uuid references public.purchase_order_items(id) on delete set null;
create index if not exists idx_shipment_items_purchase_order_item_id on public.shipment_items(purchase_order_item_id);

alter table public.receipts
  add column if not exists shipment_id uuid references public.shipments(id) on delete set null;
create index if not exists idx_receipts_shipment_id on public.receipts(shipment_id);

alter table public.receipt_items
  add column if not exists shipment_item_id uuid references public.shipment_items(id) on delete set null;
create index if not exists idx_receipt_items_shipment_item_id on public.receipt_items(shipment_item_id);
