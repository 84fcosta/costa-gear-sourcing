alter table public.shipments
  alter column usd_cad_rate type numeric(12,6) using usd_cad_rate::numeric(12,6);

create or replace function public.apply_shipment_freight(p_shipment_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_sh public.shipments%rowtype;
  v_total_cad numeric;
  v_total_basis numeric := 0;
  v_manual_total numeric := 0;
  v_basis numeric;
  v_alloc numeric;
  v_per_unit numeric;
  v_count integer := 0;
  r record;
begin
  if not exists (select 1 from public.app_members m where m.user_id = auth.uid()) then
    raise exception 'Not authorized';
  end if;

  select * into v_sh
  from public.shipments
  where id = p_shipment_id
  for update;

  if not found then
    raise exception 'Shipment not found';
  end if;

  if coalesce(v_sh.freight_amount,0) < 0 then
    raise exception 'Freight amount cannot be negative';
  end if;

  if upper(coalesce(v_sh.freight_currency,'USD')) = 'CAD' then
    v_total_cad := coalesce(v_sh.freight_amount,0);
  else
    if coalesce(v_sh.usd_cad_rate,0) <= 0 then
      raise exception 'USD/CAD rate must be greater than zero';
    end if;
    v_total_cad := coalesce(v_sh.freight_amount,0) * v_sh.usd_cad_rate;
  end if;

  if not exists (select 1 from public.shipment_items si where si.shipment_id = p_shipment_id) then
    raise exception 'Shipment has no items';
  end if;

  if v_sh.allocation_method = 'manual' then
    select coalesce(sum(coalesce(si.manual_allocation_cad,0)),0)
      into v_manual_total
    from public.shipment_items si
    where si.shipment_id = p_shipment_id;

    if abs(v_manual_total - v_total_cad) >= 0.01 then
      raise exception 'Manual allocations must equal total freight. Freight CAD: %, allocated CAD: %', round(v_total_cad,2), round(v_manual_total,2);
    end if;
  else
    for r in
      select si.id, si.product_id, si.quote_id, si.quantity,
             p.sku_id, p.weight_kg, p.length_cm, p.width_cm, p.height_cm,
             q.unit_price
      from public.shipment_items si
      join public.products p on p.id = si.product_id
      left join public.quotes q on q.id = si.quote_id
      where si.shipment_id = p_shipment_id
    loop
      if v_sh.allocation_method = 'weight' then
        if r.weight_kg is null or r.weight_kg <= 0 then
          raise exception 'Weight allocation requires a positive weight for product %', r.sku_id;
        end if;
        v_basis := r.weight_kg * r.quantity;
      elsif v_sh.allocation_method = 'volume' then
        if r.length_cm is null or r.length_cm <= 0 or r.width_cm is null or r.width_cm <= 0 or r.height_cm is null or r.height_cm <= 0 then
          raise exception 'Volume allocation requires positive L/W/H dimensions for product %', r.sku_id;
        end if;
        v_basis := (r.length_cm * r.width_cm * r.height_cm / 1000000.0) * r.quantity;
      elsif v_sh.allocation_method = 'value' then
        if r.unit_price is null or r.unit_price < 0 then
          raise exception 'Merchandise Value allocation requires a linked quote with unit price for product %', r.sku_id;
        end if;
        v_basis := r.unit_price * v_sh.usd_cad_rate * r.quantity;
      elsif v_sh.allocation_method = 'quantity' then
        v_basis := r.quantity;
      elsif v_sh.allocation_method = 'equal' then
        v_basis := 1;
      else
        raise exception 'Unsupported allocation method: %', v_sh.allocation_method;
      end if;

      v_total_basis := v_total_basis + v_basis;
    end loop;

    if v_total_basis <= 0 then
      raise exception 'Allocation basis must be greater than zero';
    end if;
  end if;

  for r in
    select si.id, si.product_id, si.quote_id, si.quantity, si.manual_allocation_cad,
           p.sku_id, p.weight_kg, p.length_cm, p.width_cm, p.height_cm,
           q.unit_price
    from public.shipment_items si
    join public.products p on p.id = si.product_id
    left join public.quotes q on q.id = si.quote_id
    where si.shipment_id = p_shipment_id
  loop
    if v_sh.allocation_method = 'manual' then
      v_basis := null;
      v_alloc := coalesce(r.manual_allocation_cad,0);
    elsif v_sh.allocation_method = 'weight' then
      v_basis := r.weight_kg * r.quantity;
      v_alloc := v_total_cad * v_basis / v_total_basis;
    elsif v_sh.allocation_method = 'volume' then
      v_basis := (r.length_cm * r.width_cm * r.height_cm / 1000000.0) * r.quantity;
      v_alloc := v_total_cad * v_basis / v_total_basis;
    elsif v_sh.allocation_method = 'value' then
      v_basis := r.unit_price * v_sh.usd_cad_rate * r.quantity;
      v_alloc := v_total_cad * v_basis / v_total_basis;
    elsif v_sh.allocation_method = 'quantity' then
      v_basis := r.quantity;
      v_alloc := v_total_cad * v_basis / v_total_basis;
    else
      v_basis := 1;
      v_alloc := v_total_cad * v_basis / v_total_basis;
    end if;

    v_per_unit := case when r.quantity > 0 then v_alloc / r.quantity else 0 end;

    update public.shipment_items
    set allocated_shipping_cad = round(v_alloc,2),
        allocation_basis = case when v_basis is null then null else round(v_basis,4) end,
        updated_at = now()
    where id = r.id;

    if r.quote_id is not null then
      update public.quotes
      set shipping_cost_per_unit_cad = round(v_per_unit,2),
          shipping_allocation_method = v_sh.allocation_method,
          shipping_cost_basis = 'shipment_allocation',
          landed_cost_cad = null
      where id = r.quote_id;
    end if;

    v_count := v_count + 1;
  end loop;

  return jsonb_build_object(
    'shipment_id', p_shipment_id,
    'allocation_method', v_sh.allocation_method,
    'freight_cad', round(v_total_cad,2),
    'item_lines', v_count
  );
end;
$$;

grant execute on function public.apply_shipment_freight(uuid) to authenticated;
