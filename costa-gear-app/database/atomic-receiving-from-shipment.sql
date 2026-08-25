create or replace function public.create_receipt_from_shipment(
  p_shipment_id uuid,
  p_receipt_ref text,
  p_received_date date default null,
  p_status text default 'Draft',
  p_location text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_shipment public.shipments%rowtype;
  v_receipt_id uuid;
  v_line_count integer;
begin
  if coalesce(trim(p_receipt_ref),'') = '' then
    raise exception 'Receipt reference is required.';
  end if;

  if coalesce(p_status,'Draft') <> 'Draft' then
    raise exception 'Create the receipt as Draft first. Confirm quantities and landed cost before Posting.';
  end if;

  select * into v_shipment
  from public.shipments
  where id = p_shipment_id;

  if not found then
    raise exception 'Shipment not found.';
  end if;

  if v_shipment.status = 'Cancelled' then
    raise exception 'Cancelled shipments cannot be received.';
  end if;

  if v_shipment.purchase_order_id is null then
    raise exception 'Shipment is not linked to a purchase order.';
  end if;

  if exists (
    select 1 from public.shipment_items
    where shipment_id = p_shipment_id
      and quantity <> trunc(quantity)
  ) then
    raise exception 'Receiving currently requires whole-unit shipment quantities.';
  end if;

  insert into public.receipts(
    receipt_ref,purchase_order_id,shipment_id,received_date,status,location,notes
  ) values (
    p_receipt_ref,v_shipment.purchase_order_id,p_shipment_id,p_received_date,'Draft',nullif(trim(p_location),''),nullif(trim(p_notes),'')
  ) returning id into v_receipt_id;

  insert into public.receipt_items(
    receipt_id,purchase_order_item_id,shipment_item_id,product_id,
    quantity_received,quantity_damaged,quantity_rejected,
    actual_landed_cost_per_unit_cad,notes
  )
  select
    v_receipt_id,
    si.purchase_order_item_id,
    si.id,
    si.product_id,
    si.quantity::integer,
    0,
    0,
    coalesce(
      case
        when q.id is not null and q.unit_price is not null and q.usd_cad_rate is not null then
          round((
            q.unit_price * q.usd_cad_rate
            + coalesce(q.shipping_cost_per_unit_cad,0)
            + (q.unit_price * q.usd_cad_rate * coalesce(q.duty_rate_pct,0) / 100)
            + coalesce(q.brokerage_cad,0)
            + coalesce(q.other_fees_cad,0)
          )::numeric,4)
        else null
      end,
      poi.landed_cost_per_unit_cad
    ),
    'Prefilled from shipment ' || v_shipment.shipment_ref
  from public.shipment_items si
  join public.purchase_order_items poi on poi.id = si.purchase_order_item_id
  left join public.quotes q on q.id = si.quote_id
  where si.shipment_id = p_shipment_id
    and si.purchase_order_item_id is not null;

  get diagnostics v_line_count = row_count;

  if v_line_count = 0 then
    raise exception 'Shipment has no PO-linked items to receive.';
  end if;

  return jsonb_build_object('receipt_id',v_receipt_id,'line_count',v_line_count);
end;
$$;

grant execute on function public.create_receipt_from_shipment(uuid,text,date,text,text,text) to authenticated;
