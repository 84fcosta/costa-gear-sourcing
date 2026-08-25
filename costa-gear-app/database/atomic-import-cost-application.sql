create or replace function public.apply_shipment_import_costs(p_shipment_id uuid)
returns table(item_lines integer, brokerage_total_cad numeric, other_total_cad numeric)
language plpgsql
security invoker
set search_path = public
as $$
declare
  s public.shipments%rowtype;
  total_basis numeric := 0;
  broker_total numeric := 0;
  other_total numeric := 0;
  rec record;
  basis_value numeric;
  line_broker numeric;
  line_other numeric;
  per_broker numeric;
  per_other numeric;
  sum_manual_broker numeric := 0;
  sum_manual_other numeric := 0;
  line_count integer := 0;
begin
  select * into s from public.shipments where id = p_shipment_id;
  if not found then raise exception 'Shipment not found'; end if;

  broker_total := coalesce(s.brokerage_amount,0) * case when s.brokerage_currency='USD' then coalesce(nullif(s.usd_cad_rate,0),1) else 1 end;
  other_total := coalesce(s.other_import_costs_amount,0) * case when s.other_import_costs_currency='USD' then coalesce(nullif(s.usd_cad_rate,0),1) else 1 end;

  select count(*) into line_count from public.shipment_items where shipment_id=p_shipment_id;
  if line_count = 0 then raise exception 'Shipment has no items'; end if;

  if s.import_allocation_method = 'manual' then
    select coalesce(sum(coalesce(manual_brokerage_cad,0)),0), coalesce(sum(coalesce(manual_other_import_cad,0)),0)
      into sum_manual_broker, sum_manual_other
    from public.shipment_items where shipment_id=p_shipment_id;
    if abs(sum_manual_broker-broker_total) > 0.01 then raise exception 'Manual brokerage allocation must equal shipment brokerage total'; end if;
    if abs(sum_manual_other-other_total) > 0.01 then raise exception 'Manual other-cost allocation must equal shipment other-cost total'; end if;
  elsif (broker_total <> 0 or other_total <> 0) then
    select coalesce(sum(case s.import_allocation_method
      when 'weight' then coalesce(p.weight_kg,0) * si.quantity
      when 'volume' then case when p.length_cm is null or p.width_cm is null or p.height_cm is null then 0 else (p.length_cm*p.width_cm*p.height_cm/1000000.0)*si.quantity end
      when 'value' then coalesce(q.unit_price,0) * coalesce(nullif(s.usd_cad_rate,0),1) * si.quantity
      when 'quantity' then si.quantity
      when 'equal' then 1 else 0 end),0) into total_basis
    from public.shipment_items si
    left join public.products p on p.id=si.product_id
    left join public.quotes q on q.id=si.quote_id
    where si.shipment_id=p_shipment_id;
    if total_basis <= 0 then raise exception 'Allocation basis is incomplete for method %', s.import_allocation_method; end if;
  end if;

  for rec in
    select si.*, p.weight_kg,p.length_cm,p.width_cm,p.height_cm,q.unit_price,
           coalesce(q.brokerage_cad,0) as quote_brokerage_cad,
           coalesce(q.other_fees_cad,0) as quote_other_fees_cad
    from public.shipment_items si
    left join public.products p on p.id=si.product_id
    left join public.quotes q on q.id=si.quote_id
    where si.shipment_id=p_shipment_id
    order by si.created_at, si.id
  loop
    if s.import_allocation_method='manual' then
      line_broker := coalesce(rec.manual_brokerage_cad,0);
      line_other := coalesce(rec.manual_other_import_cad,0);
    elsif broker_total=0 and other_total=0 then
      line_broker := 0; line_other := 0;
    else
      basis_value := case s.import_allocation_method
        when 'weight' then coalesce(rec.weight_kg,0) * rec.quantity
        when 'volume' then case when rec.length_cm is null or rec.width_cm is null or rec.height_cm is null then 0 else (rec.length_cm*rec.width_cm*rec.height_cm/1000000.0)*rec.quantity end
        when 'value' then coalesce(rec.unit_price,0) * coalesce(nullif(s.usd_cad_rate,0),1) * rec.quantity
        when 'quantity' then rec.quantity
        when 'equal' then 1 else 0 end;
      line_broker := broker_total * basis_value / total_basis;
      line_other := other_total * basis_value / total_basis;
    end if;

    per_broker := case when rec.quantity=0 then 0 else line_broker/rec.quantity end;
    per_other := case when rec.quantity=0 then 0 else line_other/rec.quantity end;

    if rec.quote_id is not null then
      update public.quotes
      set brokerage_cad = round((rec.quote_brokerage_cad - coalesce(rec.allocated_brokerage_per_unit_cad,0) + per_broker)::numeric,2),
          other_fees_cad = round((rec.quote_other_fees_cad - coalesce(rec.allocated_other_import_per_unit_cad,0) + per_other)::numeric,2),
          duty_rate_pct = case when rec.duty_rate_pct is null then duty_rate_pct else rec.duty_rate_pct end,
          landed_cost_cad = null
      where id=rec.quote_id;
    end if;

    update public.shipment_items
    set allocated_brokerage_cad = round(line_broker::numeric,2),
        allocated_brokerage_per_unit_cad = round(per_broker::numeric,4),
        allocated_other_import_cad = round(line_other::numeric,2),
        allocated_other_import_per_unit_cad = round(per_other::numeric,4)
    where id=rec.id;
  end loop;

  return query select line_count, round(broker_total::numeric,2), round(other_total::numeric,2);
end;
$$;

grant execute on function public.apply_shipment_import_costs(uuid) to authenticated;
