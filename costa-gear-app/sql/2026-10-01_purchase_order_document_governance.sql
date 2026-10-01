-- Applied to Supabase project xioqglqjwygveqllepmb on 2026-10-01.
-- Adds stable PO numbering for governed filenames and metadata fields for PO documents.

create sequence if not exists public.purchase_order_number_seq;

alter table public.purchase_orders
  add column if not exists po_number integer;

with ranked as (
  select id, row_number() over (order by created_at, id)::integer as n
  from public.purchase_orders
)
update public.purchase_orders p
set po_number = r.n
from ranked r
where p.id = r.id
  and p.po_number is null;

alter sequence public.purchase_order_number_seq
  owned by public.purchase_orders.po_number;

alter table public.purchase_orders
  alter column po_number set default nextval('public.purchase_order_number_seq');

do $$
declare
  v_max integer;
begin
  select coalesce(max(po_number), 0) into v_max from public.purchase_orders;
  if v_max = 0 then
    perform setval('public.purchase_order_number_seq', 1, false);
  else
    perform setval('public.purchase_order_number_seq', v_max, true);
  end if;
end $$;

alter table public.purchase_orders
  alter column po_number set not null;

create unique index if not exists purchase_orders_po_number_key
  on public.purchase_orders (po_number);

alter table public.purchase_order_documents
  add column if not exists document_date date,
  add column if not exists original_file_name text,
  add column if not exists created_by uuid default auth.uid();
