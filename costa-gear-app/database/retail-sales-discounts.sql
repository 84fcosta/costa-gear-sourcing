-- Retail discount model for Sales.
-- Supports line-level and order-level discounts as fixed CAD amounts or percentages.
-- Existing line discounts are preserved as fixed-amount discounts.

alter table public.sales_orders
  add column if not exists order_discount_type text not null default 'none',
  add column if not exists order_discount_value numeric(12,4) not null default 0;

alter table public.sales_order_items
  add column if not exists discount_type text not null default 'amount',
  add column if not exists discount_value numeric(12,4) not null default 0;

alter table public.sales_order_items disable trigger trg_validate_sales_item_change;

update public.sales_order_items
set discount_type = 'amount',
    discount_value = discount_cad
where coalesce(discount_value,0) = 0
  and coalesce(discount_cad,0) > 0;

alter table public.sales_order_items enable trigger trg_validate_sales_item_change;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='sales_orders_order_discount_type_check') then
    alter table public.sales_orders
      add constraint sales_orders_order_discount_type_check
      check (order_discount_type in ('none','amount','percentage'));
  end if;
  if not exists (select 1 from pg_constraint where conname='sales_orders_order_discount_value_check') then
    alter table public.sales_orders
      add constraint sales_orders_order_discount_value_check
      check (order_discount_value >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname='sales_order_items_discount_type_check') then
    alter table public.sales_order_items
      add constraint sales_order_items_discount_type_check
      check (discount_type in ('amount','percentage'));
  end if;
  if not exists (select 1 from pg_constraint where conname='sales_order_items_discount_value_check') then
    alter table public.sales_order_items
      add constraint sales_order_items_discount_value_check
      check (discount_value >= 0);
  end if;
end $$;

create or replace function app_private.normalize_sales_item_discount()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  gross_cad numeric;
  dtype text;
  dvalue numeric;
begin
  gross_cad := round((coalesce(new.unit_sell_price_cad,0) * coalesce(new.quantity,0))::numeric,2);
  dtype := lower(coalesce(nullif(new.discount_type,''),'amount'));
  dvalue := coalesce(new.discount_value,0);

  if dtype not in ('amount','percentage') then
    raise exception 'Unsupported line discount type: %', dtype using errcode='23514';
  end if;
  if dvalue < 0 then
    raise exception 'Discount value cannot be negative.' using errcode='23514';
  end if;
  if dtype = 'percentage' and dvalue > 100 then
    raise exception 'Percentage discount cannot exceed 100%%.' using errcode='23514';
  end if;
  if dtype = 'amount' and dvalue > gross_cad then
    raise exception 'Line discount cannot exceed the line gross amount.' using errcode='23514';
  end if;

  new.discount_type := dtype;
  new.discount_value := round(dvalue::numeric,4);
  new.discount_cad := case
    when dtype='percentage' then round((gross_cad * dvalue / 100)::numeric,2)
    else round(dvalue::numeric,2)
  end;
  return new;
end;
$$;

revoke all on function app_private.normalize_sales_item_discount() from public, anon, authenticated;

drop trigger if exists trg_normalize_sales_item_discount on public.sales_order_items;
create trigger trg_normalize_sales_item_discount
before insert or update of quantity, unit_sell_price_cad, discount_type, discount_value
on public.sales_order_items
for each row execute function app_private.normalize_sales_item_discount();

create or replace function app_private.validate_sales_order_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  line record;
  available_qty integer;
  discount_type text;
  discount_value numeric;
begin
  discount_type := lower(coalesce(nullif(new.order_discount_type,''),'none'));
  discount_value := coalesce(new.order_discount_value,0);

  if discount_type not in ('none','amount','percentage') then
    raise exception 'Unsupported order discount type: %', discount_type using errcode='23514';
  end if;
  if discount_value < 0 then
    raise exception 'Order discount value cannot be negative.' using errcode='23514';
  end if;
  if discount_type='percentage' and discount_value > 100 then
    raise exception 'Order percentage discount cannot exceed 100%%.' using errcode='23514';
  end if;

  new.order_discount_type := discount_type;
  new.order_discount_value := case when discount_type='none' then 0 else round(discount_value::numeric,4) end;

  if new.status in ('Confirmed','Paid','Shipped','Completed') then
    if new.sold_date is null then
      raise exception 'Sold Date is required before a sale can become active.' using errcode='23514';
    end if;
    if not exists (select 1 from public.sales_order_items i where i.sales_order_id = new.id) then
      raise exception 'Add at least one product before confirming a sale.' using errcode='23514';
    end if;
    for line in select product_id, quantity from public.sales_order_items where sales_order_id = new.id loop
      available_qty := app_private.sales_available_units(line.product_id, new.id);
      if line.quantity > available_qty then
        raise exception 'Insufficient available inventory for product %. Requested %, available %.',
          line.product_id, line.quantity, available_qty using errcode='23514';
      end if;
    end loop;
  end if;
  return new;
end;
$$;

revoke all on function app_private.validate_sales_order_state() from public, anon, authenticated;

drop trigger if exists trg_validate_sales_order_state on public.sales_orders;
create trigger trg_validate_sales_order_state
before insert or update on public.sales_orders
for each row execute function app_private.validate_sales_order_state();
