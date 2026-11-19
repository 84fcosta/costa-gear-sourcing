-- Import-cost allocations are stored by shipment line in cents, but the
-- corresponding per-unit values require extra precision to reconcile those
-- line totals across multi-unit quantities.

drop trigger if exists trg_normalize_quote_landed_cost on public.quotes;

alter table public.quotes
  alter column brokerage_cad type numeric(18,6)
    using brokerage_cad::numeric(18,6),
  alter column other_fees_cad type numeric(18,6)
    using other_fees_cad::numeric(18,6);

alter table public.shipment_items
  alter column allocated_brokerage_per_unit_cad type numeric(18,6)
    using allocated_brokerage_per_unit_cad::numeric(18,6),
  alter column allocated_other_import_per_unit_cad type numeric(18,6)
    using allocated_other_import_per_unit_cad::numeric(18,6);

create trigger trg_normalize_quote_landed_cost
before insert or update of
  unit_price, usd_cad_rate, incoterm, shipping_cost, shipping_currency,
  shipping_cost_per_unit_cad, duty_rate_pct, brokerage_cad, other_fees_cad
on public.quotes
for each row execute function public.normalize_quote_landed_cost();

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
  broker_target numeric := 0;
  other_target numeric := 0;
  rec record;
  basis_value numeric;
  line_broker numeric;
  line_other numeric;
  per_broker numeric;
  per_other numeric;
  sum_manual_broker numeric := 0;
  sum_manual_other numeric := 0;
  line_count integer := 0;
  allocated_broker_total numeric := 0;
  allocated_other_total numeric := 0;
  broker_residual numeric := 0;
  other_residual numeric := 0;
  max_basis numeric := -1;
  adjust_item_id uuid;
  adjust_quote_id uuid;
  adjust_qty numeric;
  adjusted_broker_line numeric;
  adjusted_other_line numeric;
  existing_quote_broker numeric;
  existing_quote_other numeric;
  old_alloc_broker_per_unit numeric;
  old_alloc_other_per_unit numeric;
begin
  if not exists (select 1 from public.app_members m where m.user_id = auth.uid()) then
    raise exception 'Not authorized';
  end if;

  select * into s
  from public.shipments
  where id = p_shipment_id
  for update;

  if not found then raise exception 'Shipment not found'; end if;

  broker_total := coalesce(s.brokerage_amount,0)
    * case when s.brokerage_currency='USD' then coalesce(nullif(s.usd_cad_rate,0),1) else 1 end;
  other_total := coalesce(s.other_import_costs_amount,0)
    * case when s.other_import_costs_currency='USD' then coalesce(nullif(s.usd_cad_rate,0),1) else 1 end;

  broker_target := round(broker_total,2);
  other_target := round(other_total,2);

  select count(*) into line_count
  from public.shipment_items
  where shipment_id=p_shipment_id;

  if line_count = 0 then raise exception 'Shipment has no items'; end if;

  if s.import_allocation_method = 'manual' then
    select
      coalesce(sum(coalesce(manual_brokerage_cad,0)),0),
      coalesce(sum(coalesce(manual_other_import_cad,0)),0)
    into sum_manual_broker, sum_manual_other
    from public.shipment_items
    where shipment_id=p_shipment_id;

    if abs(sum_manual_broker-broker_target) >= 0.01 then
      raise exception 'Manual brokerage allocation must equal shipment brokerage total';
    end if;
    if abs(sum_manual_other-other_target) >= 0.01 then
      raise exception 'Manual other-cost allocation must equal shipment other-cost total';
    end if;
  elsif (broker_target <> 0 or other_target <> 0) then
    for rec in
      select
        si.id, si.quantity, si.quote_id,
        p.weight_kg, p.length_cm, p.width_cm, p.height_cm,
        q.unit_price
      from public.shipment_items si
      left join public.products p on p.id=si.product_id
      left join public.quotes q on q.id=si.quote_id
      where si.shipment_id=p_shipment_id
      order by si.created_at, si.id
    loop
      basis_value := case s.import_allocation_method
        when 'weight' then coalesce(rec.weight_kg,0) * rec.quantity
        when 'volume' then case
          when rec.length_cm is null or rec.width_cm is null or rec.height_cm is null then 0
          else (rec.length_cm*rec.width_cm*rec.height_cm/1000000.0)*rec.quantity
        end
        when 'value' then coalesce(rec.unit_price,0) * coalesce(nullif(s.usd_cad_rate,0),1) * rec.quantity
        when 'quantity' then rec.quantity
        when 'equal' then 1
        else 0
      end;

      total_basis := total_basis + basis_value;

      if basis_value > max_basis then
        max_basis := basis_value;
        adjust_item_id := rec.id;
        adjust_quote_id := rec.quote_id;
        adjust_qty := rec.quantity;
      end if;
    end loop;

    if total_basis <= 0 then
      raise exception 'Allocation basis is incomplete for method %', s.import_allocation_method;
    end if;
  end if;

  for rec in
    select
      si.*,
      p.weight_kg,p.length_cm,p.width_cm,p.height_cm,
      q.unit_price,
      coalesce(q.brokerage_cad,0) as quote_brokerage_cad,
      coalesce(q.other_fees_cad,0) as quote_other_fees_cad
    from public.shipment_items si
    left join public.products p on p.id=si.product_id
    left join public.quotes q on q.id=si.quote_id
    where si.shipment_id=p_shipment_id
    order by si.created_at, si.id
  loop
    existing_quote_broker := rec.quote_brokerage_cad;
    existing_quote_other := rec.quote_other_fees_cad;
    old_alloc_broker_per_unit := coalesce(rec.allocated_brokerage_per_unit_cad,0);
    old_alloc_other_per_unit := coalesce(rec.allocated_other_import_per_unit_cad,0);

    if s.import_allocation_method='manual' then
      line_broker := round(coalesce(rec.manual_brokerage_cad,0),2);
      line_other := round(coalesce(rec.manual_other_import_cad,0),2);
    elsif broker_target=0 and other_target=0 then
      line_broker := 0;
      line_other := 0;
    else
      basis_value := case s.import_allocation_method
        when 'weight' then coalesce(rec.weight_kg,0) * rec.quantity
        when 'volume' then case
          when rec.length_cm is null or rec.width_cm is null or rec.height_cm is null then 0
          else (rec.length_cm*rec.width_cm*rec.height_cm/1000000.0)*rec.quantity
        end
        when 'value' then coalesce(rec.unit_price,0) * coalesce(nullif(s.usd_cad_rate,0),1) * rec.quantity
        when 'quantity' then rec.quantity
        when 'equal' then 1
        else 0
      end;

      line_broker := round((broker_total * basis_value / total_basis)::numeric,2);
      line_other := round((other_total * basis_value / total_basis)::numeric,2);
    end if;

    per_broker := case when rec.quantity=0 then 0 else line_broker/rec.quantity end;
    per_other := case when rec.quantity=0 then 0 else line_other/rec.quantity end;

    if rec.quote_id is not null then
      update public.quotes
      set brokerage_cad = round(
            (existing_quote_broker - old_alloc_broker_per_unit + per_broker)::numeric,
            6
          ),
          other_fees_cad = round(
            (existing_quote_other - old_alloc_other_per_unit + per_other)::numeric,
            6
          ),
          duty_rate_pct = case when rec.duty_rate_pct is null then duty_rate_pct else rec.duty_rate_pct end,
          landed_cost_cad = null
      where id=rec.quote_id;
    end if;

    update public.shipment_items
    set allocated_brokerage_cad = line_broker,
        allocated_brokerage_per_unit_cad = round(per_broker::numeric,6),
        allocated_other_import_cad = line_other,
        allocated_other_import_per_unit_cad = round(per_other::numeric,6)
    where id=rec.id;

    allocated_broker_total := allocated_broker_total + line_broker;
    allocated_other_total := allocated_other_total + line_other;
  end loop;

  if s.import_allocation_method <> 'manual' then
    broker_residual := round(broker_target - allocated_broker_total,2);
    other_residual := round(other_target - allocated_other_total,2);

    if broker_residual <> 0 or other_residual <> 0 then
      select
        allocated_brokerage_cad + broker_residual,
        allocated_other_import_cad + other_residual
      into adjusted_broker_line, adjusted_other_line
      from public.shipment_items
      where id=adjust_item_id;

      update public.shipment_items
      set allocated_brokerage_cad = adjusted_broker_line,
          allocated_brokerage_per_unit_cad = round(
            case when adjust_qty > 0 then adjusted_broker_line/adjust_qty else 0 end,
            6
          ),
          allocated_other_import_cad = adjusted_other_line,
          allocated_other_import_per_unit_cad = round(
            case when adjust_qty > 0 then adjusted_other_line/adjust_qty else 0 end,
            6
          )
      where id=adjust_item_id;

      if adjust_quote_id is not null then
        select
          coalesce(q.brokerage_cad,0),
          coalesce(q.other_fees_cad,0),
          coalesce(si.allocated_brokerage_per_unit_cad,0),
          coalesce(si.allocated_other_import_per_unit_cad,0)
        into
          existing_quote_broker,
          existing_quote_other,
          per_broker,
          per_other
        from public.shipment_items si
        join public.quotes q on q.id=si.quote_id
        where si.id=adjust_item_id;

        update public.quotes
        set brokerage_cad = round((existing_quote_broker + broker_residual/adjust_qty)::numeric,6),
            other_fees_cad = round((existing_quote_other + other_residual/adjust_qty)::numeric,6),
            landed_cost_cad = null
        where id=adjust_quote_id;
      end if;

      allocated_broker_total := allocated_broker_total + broker_residual;
      allocated_other_total := allocated_other_total + other_residual;
    end if;
  end if;

  return query
  select
    line_count,
    round(allocated_broker_total::numeric,2),
    round(allocated_other_total::numeric,2);
end;
$$;

revoke execute on function public.apply_shipment_import_costs(uuid) from public;
revoke execute on function public.apply_shipment_import_costs(uuid) from anon;
grant execute on function public.apply_shipment_import_costs(uuid) to authenticated;
