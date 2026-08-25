create or replace function public.create_shipment_from_po(
  p_purchase_order_id uuid,
  p_status text default 'Planning',
  p_shipping_method text default null,
  p_freight_amount numeric default 0,
  p_freight_currency text default 'USD',
  p_usd_cad_rate numeric default null,
  p_allocation_method text default 'weight',
  p_notes text default null
)
returns public.shipments
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_po public.purchase_orders;
  v_shipment public.shipments;
  v_ref text;
  v_item_count integer;
begin
  if not exists (select 1 from public.app_members m where m.user_id = auth.uid()) then
    raise exception 'Not authorized for Costa Gear operations.';
  end if;

  select * into v_po
  from public.purchase_orders
  where id = p_purchase_order_id;

  if not found then
    raise exception 'Purchase order not found.';
  end if;

  if v_po.status not in ('Approved','Ordered','Partially Received') then
    raise exception 'Shipment can only be created from an Approved, Ordered, or Partially Received PO.';
  end if;

  select count(*) into v_item_count
  from public.purchase_order_items
  where purchase_order_id = p_purchase_order_id;

  if v_item_count = 0 then
    raise exception 'The selected PO has no items.';
  end if;

  if p_freight_amount is null or p_freight_amount < 0 then
    raise exception 'Freight amount must be zero or greater.';
  end if;

  if p_usd_cad_rate is null or p_usd_cad_rate <= 0 then
    raise exception 'Enter a valid USD/CAD rate.';
  end if;

  if p_allocation_method not in ('weight','volume','value','quantity','equal','manual') then
    raise exception 'Invalid freight allocation method.';
  end if;

  loop
    v_ref := 'SHP-' || to_char(current_date,'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
    exit when not exists (select 1 from public.shipments where shipment_ref = v_ref);
  end loop;

  insert into public.shipments(
    shipment_ref, purchase_order_id, supplier_id, status, shipping_method,
    freight_amount, freight_currency, usd_cad_rate, allocation_method, notes
  ) values (
    v_ref, p_purchase_order_id, v_po.supplier_id, coalesce(nullif(trim(p_status),''),'Planning'),
    nullif(trim(p_shipping_method),''), p_freight_amount,
    coalesce(nullif(trim(p_freight_currency),''),'USD'), p_usd_cad_rate,
    p_allocation_method, nullif(trim(p_notes),'')
  ) returning * into v_shipment;

  insert into public.shipment_items(
    shipment_id, purchase_order_item_id, product_id, quote_id, quantity
  )
  select
    v_shipment.id, poi.id, poi.product_id, poi.quote_id, poi.quantity
  from public.purchase_order_items poi
  where poi.purchase_order_id = p_purchase_order_id
  order by poi.created_at;

  return v_shipment;
end;
$$;
