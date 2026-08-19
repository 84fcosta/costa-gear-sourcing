-- Phase 4: sales inventory guards
-- Applied to production on 2026-08-19.

create or replace function app_private.sales_available_units(p_product_id uuid, p_exclude_sales_order_id uuid default null)
returns integer
language sql
security definer
set search_path = ''
as $$
  with received as (
    select coalesce(sum(greatest(0, ri.quantity_received - ri.quantity_damaged - ri.quantity_rejected)),0)::integer as qty
    from public.receipt_items ri
    join public.receipts r on r.id = ri.receipt_id
    where r.status = 'Posted' and ri.product_id = p_product_id
  ), committed as (
    select coalesce(sum(soi.quantity),0)::integer as qty
    from public.sales_order_items soi
    join public.sales_orders so on so.id = soi.sales_order_id
    where soi.product_id = p_product_id
      and so.status in ('Confirmed','Paid','Shipped','Completed')
      and (p_exclude_sales_order_id is null or so.id <> p_exclude_sales_order_id)
  )
  select greatest(0, received.qty - committed.qty)::integer from received, committed;
$$;
revoke all on function app_private.sales_available_units(uuid,uuid) from public, anon, authenticated;

create or replace function app_private.validate_sales_order_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare line record; available_qty integer;
begin
  if new.status in ('Confirmed','Paid','Shipped','Completed') then
    if new.sold_date is null then raise exception 'Sold Date is required before a sale can become active.' using errcode = '23514'; end if;
    if not exists (select 1 from public.sales_order_items i where i.sales_order_id = new.id) then raise exception 'Add at least one product before confirming a sale.' using errcode = '23514'; end if;
    for line in select product_id, quantity from public.sales_order_items where sales_order_id = new.id loop
      available_qty := app_private.sales_available_units(line.product_id, new.id);
      if line.quantity > available_qty then raise exception 'Insufficient available inventory for product %. Requested %, available %.', line.product_id, line.quantity, available_qty using errcode = '23514'; end if;
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function app_private.validate_sales_order_state() from public, anon, authenticated;

drop trigger if exists trg_validate_sales_order_state on public.sales_orders;
create trigger trg_validate_sales_order_state before insert or update on public.sales_orders for each row execute function app_private.validate_sales_order_state();

create or replace function app_private.validate_sales_item_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare order_status text; order_id uuid;
begin
  order_id := case when tg_op = 'DELETE' then old.sales_order_id else new.sales_order_id end;
  select status into order_status from public.sales_orders where id = order_id;
  if order_status is distinct from 'Draft' then raise exception 'Sale product lines can only be changed while the sale is Draft.' using errcode = '23514'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function app_private.validate_sales_item_change() from public, anon, authenticated;

drop trigger if exists trg_validate_sales_item_change on public.sales_order_items;
create trigger trg_validate_sales_item_change before insert or update or delete on public.sales_order_items for each row execute function app_private.validate_sales_item_change();
