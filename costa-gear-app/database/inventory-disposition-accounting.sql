-- Costa Gear inventory disposition / adjustment
-- Preserves Receiving history and records permanent removal from sellable inventory.

begin;

create sequence if not exists public.inventory_disposition_number_seq start 1;

create table if not exists public.inventory_dispositions (
  id uuid primary key default gen_random_uuid(),
  disposition_number bigint not null default nextval('public.inventory_disposition_number_seq'),
  disposition_ref text generated always as ('ADJ' || lpad(disposition_number::text, 4, '0')) stored,
  product_id uuid not null references public.products(id) on delete restrict,
  disposition_date date not null default current_date,
  disposition_type text not null check (
    disposition_type in (
      'prototype_internal_use',
      'display_demo',
      'damaged_unsellable',
      'lost_missing',
      'returned_supplier',
      'other_adjustment'
    )
  ),
  accounting_treatment text not null check (
    accounting_treatment in (
      'expense_now',
      'capital_asset',
      'inventory_writeoff',
      'supplier_return'
    )
  ),
  quantity integer not null check (quantity > 0),
  recovery_amount_cad numeric(14,2) not null default 0 check (recovery_amount_cad >= 0),
  notes text,
  status text not null default 'Posted' check (status in ('Posted')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create unique index if not exists inventory_dispositions_number_uidx
  on public.inventory_dispositions(disposition_number);
create index if not exists inventory_dispositions_product_date_idx
  on public.inventory_dispositions(product_id, disposition_date desc, created_at desc);

create table if not exists public.inventory_disposition_lines (
  id uuid primary key default gen_random_uuid(),
  disposition_id uuid not null references public.inventory_dispositions(id) on delete restrict,
  receipt_item_id uuid not null references public.receipt_items(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_cost_cad numeric(14,4) not null check (unit_cost_cad >= 0),
  created_at timestamptz not null default now(),
  constraint inventory_disposition_lines_unique_lot unique (disposition_id, receipt_item_id)
);

create index if not exists inventory_disposition_lines_receipt_item_idx
  on public.inventory_disposition_lines(receipt_item_id);

alter table public.inventory_dispositions enable row level security;
alter table public.inventory_disposition_lines enable row level security;

drop policy if exists "members read inventory dispositions" on public.inventory_dispositions;
create policy "members read inventory dispositions"
on public.inventory_dispositions
for select
to authenticated
using (
  exists (
    select 1
    from public.app_members m
    where m.user_id = (select auth.uid())
  )
);

drop policy if exists "members read inventory disposition lines" on public.inventory_disposition_lines;
create policy "members read inventory disposition lines"
on public.inventory_disposition_lines
for select
to authenticated
using (
  exists (
    select 1
    from public.app_members m
    where m.user_id = (select auth.uid())
  )
);

revoke all on public.inventory_dispositions from anon, authenticated;
revoke all on public.inventory_disposition_lines from anon, authenticated;
grant select on public.inventory_dispositions to authenticated;
grant select on public.inventory_disposition_lines to authenticated;
grant all on public.inventory_dispositions to service_role;
grant all on public.inventory_disposition_lines to service_role;
grant usage, select on sequence public.inventory_disposition_number_seq to service_role;

create or replace function public.create_inventory_disposition(
  p_product_id uuid,
  p_quantity integer,
  p_disposition_type text,
  p_accounting_treatment text,
  p_disposition_date date default current_date,
  p_recovery_amount_cad numeric default 0,
  p_notes text default null
)
returns table (
  disposition_id uuid,
  disposition_ref text,
  total_cost_cad numeric,
  net_accounting_amount_cad numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_disposition_id uuid;
  v_disposition_ref text;
  v_qty_remaining integer := p_quantity;
  v_sales_remaining integer := 0;
  v_lot_available integer;
  v_sales_used integer;
  v_alloc integer;
  v_total_cost numeric := 0;
  v_recovery numeric := coalesce(p_recovery_amount_cad, 0);
  lot record;
begin
  if v_uid is null or not exists (
    select 1 from public.app_members m where m.user_id = v_uid
  ) then
    raise exception 'Not authorized for Costa Gear inventory adjustments.';
  end if;

  if p_product_id is null or not exists (select 1 from public.products p where p.id = p_product_id) then
    raise exception 'Select a valid product.';
  end if;

  if coalesce(p_quantity, 0) <= 0 then
    raise exception 'Adjustment quantity must be greater than zero.';
  end if;

  if p_disposition_type not in (
    'prototype_internal_use',
    'display_demo',
    'damaged_unsellable',
    'lost_missing',
    'returned_supplier',
    'other_adjustment'
  ) then
    raise exception 'Unsupported disposition reason.';
  end if;

  if p_accounting_treatment not in (
    'expense_now',
    'capital_asset',
    'inventory_writeoff',
    'supplier_return'
  ) then
    raise exception 'Unsupported accounting treatment.';
  end if;

  if p_disposition_type in ('prototype_internal_use','display_demo')
     and p_accounting_treatment not in ('expense_now','capital_asset') then
    raise exception 'Prototype / demo items must be expensed now or reclassified as a capital asset.';
  end if;

  if p_disposition_type in ('damaged_unsellable','lost_missing')
     and p_accounting_treatment <> 'inventory_writeoff' then
    raise exception 'Damaged / lost inventory must use Inventory Write-off accounting.';
  end if;

  if p_disposition_type = 'returned_supplier'
     and p_accounting_treatment <> 'supplier_return' then
    raise exception 'Supplier returns must use Supplier Return accounting.';
  end if;

  if v_recovery < 0 then
    raise exception 'Recovery amount cannot be negative.';
  end if;

  if p_disposition_type in ('prototype_internal_use','display_demo') and v_recovery > 0 then
    raise exception 'Prototype / demo disposition cannot include a recovery amount.';
  end if;

  select coalesce(sum(soi.quantity), 0)::integer
  into v_sales_remaining
  from public.sales_order_items soi
  join public.sales_orders so on so.id = soi.sales_order_id
  where soi.product_id = p_product_id
    and so.status in ('Confirmed','Paid','Shipped','Completed');

  insert into public.inventory_dispositions (
    product_id,
    disposition_date,
    disposition_type,
    accounting_treatment,
    quantity,
    recovery_amount_cad,
    notes,
    created_by
  )
  values (
    p_product_id,
    coalesce(p_disposition_date, current_date),
    p_disposition_type,
    p_accounting_treatment,
    p_quantity,
    v_recovery,
    nullif(trim(coalesce(p_notes, '')), ''),
    v_uid
  )
  returning id, inventory_dispositions.disposition_ref
  into v_disposition_id, v_disposition_ref;

  for lot in
    select
      ri.id as receipt_item_id,
      greatest(
        0,
        coalesce(ri.quantity_received, 0)
        - coalesce(ri.quantity_damaged, 0)
        - coalesce(ri.quantity_rejected, 0)
      )::integer as sellable_qty,
      coalesce(
        ri.actual_landed_cost_per_unit_cad,
        poi.landed_cost_per_unit_cad
      ) as unit_cost_cad,
      coalesce((
        select sum(idl.quantity)
        from public.inventory_disposition_lines idl
        join public.inventory_dispositions idh on idh.id = idl.disposition_id
        where idl.receipt_item_id = ri.id
          and idh.status = 'Posted'
          and idh.id <> v_disposition_id
      ), 0)::integer as already_disposed
    from public.receipt_items ri
    join public.receipts r on r.id = ri.receipt_id
    left join public.purchase_order_items poi on poi.id = ri.purchase_order_item_id
    where ri.product_id = p_product_id
      and r.status = 'Posted'
    order by coalesce(r.received_date, r.created_at::date), ri.created_at, ri.id
  loop
    exit when v_qty_remaining <= 0;

    v_lot_available := greatest(0, lot.sellable_qty - lot.already_disposed);
    if v_lot_available <= 0 then
      continue;
    end if;

    if v_sales_remaining > 0 then
      v_sales_used := least(v_lot_available, v_sales_remaining);
      v_lot_available := v_lot_available - v_sales_used;
      v_sales_remaining := v_sales_remaining - v_sales_used;
    end if;

    if v_lot_available <= 0 then
      continue;
    end if;

    v_alloc := least(v_lot_available, v_qty_remaining);

    if lot.unit_cost_cad is null then
      raise exception 'Landed cost is missing for an inventory lot required by this adjustment. Resolve landed cost before posting the disposition.';
    end if;

    insert into public.inventory_disposition_lines (
      disposition_id,
      receipt_item_id,
      quantity,
      unit_cost_cad
    )
    values (
      v_disposition_id,
      lot.receipt_item_id,
      v_alloc,
      lot.unit_cost_cad
    );

    v_total_cost := v_total_cost + (v_alloc * lot.unit_cost_cad);
    v_qty_remaining := v_qty_remaining - v_alloc;
  end loop;

  if v_qty_remaining > 0 then
    raise exception 'Insufficient available inventory. Requested %, but % unit(s) could not be allocated after sales commitments and prior dispositions.',
      p_quantity, v_qty_remaining;
  end if;

  if v_recovery > v_total_cost then
    raise exception 'Recovery amount cannot exceed the inventory cost being removed.';
  end if;

  return query
  select
    v_disposition_id,
    v_disposition_ref,
    round(v_total_cost, 2),
    round(v_total_cost - v_recovery, 2);
end;
$$;

revoke all on function public.create_inventory_disposition(uuid,integer,text,text,date,numeric,text)
  from public, anon, authenticated;
grant execute on function public.create_inventory_disposition(uuid,integer,text,text,date,numeric,text)
  to authenticated, service_role;

commit;
