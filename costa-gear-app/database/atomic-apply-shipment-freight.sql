alter table public.shipments
  alter column usd_cad_rate type numeric(12,6) using usd_cad_rate::numeric(12,6);

-- Freight is stored at shipment-line level in cents, but per-unit freight
-- needs additional precision so line quantities can reconcile to those cents.
alter table public.quotes
  alter column shipping_cost_per_unit_cad type numeric(18,6)
  using shipping_cost_per_unit_cad::numeric(18,6);

create or replace function public.apply_shipment_freight(p_shipment_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_sh public.shipments%rowtype;
  v_total_cad numeric;
  v_target_cad numeric;
  v_total_basis numeric := 0;
  v_manual_total numeric := 0;
  v_basis numeric;
  v_raw_alloc numeric;
  v_alloc numeric;
  v_per_unit numeric;
  v_allocated_total numeric := 0;
  v_residual numeric := 0;
  v_max_basis numeric := -1;
  v_adjust_item_id uuid;
  v_adjust_quote_id uuid;
  v_adjust_qty numeric;
  v_adjust_alloc numeric;
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

  v_target_cad := round(v_total_cad, 2);

  if not exists (select 1 from public.shipment_items si where si.shipment_id = p_shipment_id) then
    raise exception 'Shipment has no items';
  end if;

  if v_sh.allocation_method = 'manual' then
    select coalesce(sum(coalesce(si.manual_allocation_cad,0)),0)
      into v_manual_total
    from public.shipment_items si
    where si.shipment_id = p_shipment_id;

    if abs(v_manual_total - v_target_cad) >= 0.01 then
      raise exception 'Manual allocations must equal total freight. Freight CAD: %, allocated CAD: %', v_target_cad, round(v_manual_total,2);
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
      order by si.created_at, si.id
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

      -- Put any final cent-level residual on the largest allocation line.
      -- This minimizes the proportional effect of the adjustment.
      if v_basis > v_max_basis then
        v_max_basis := v_basis;
        v_adjust_item_id := r.id;
        v_adjust_quote_id := r.quote_id;
        v_adjust_qty := r.quantity;
      end if;
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
    order by si.created_at, si.id
  loop
    if v_sh.allocation_method = 'manual' then
      v_basis := null;
      v_alloc := round(coalesce(r.manual_allocation_cad,0),2);
    else
      if v_sh.allocation_method = 'weight' then
        v_basis := r.weight_kg * r.quantity;
      elsif v_sh.allocation_method = 'volume' then
        v_basis := (r.length_cm * r.width_cm * r.height_cm / 1000000.0) * r.quantity;
      elsif v_sh.allocation_method = 'value' then
        v_basis := r.unit_price * v_sh.usd_cad_rate * r.quantity;
      elsif v_sh.allocation_method = 'quantity' then
        v_basis := r.quantity;
      else
        v_basis := 1;
      end if;

      v_raw_alloc := v_total_cad * v_basis / v_total_basis;
      v_alloc := round(v_raw_alloc,2);
    end if;

    v_per_unit := case when r.quantity > 0 then v_alloc / r.quantity else 0 end;

    update public.shipment_items
    set allocated_shipping_cad = v_alloc,
        allocation_basis = case when v_basis is null then null else round(v_basis,4) end,
        updated_at = now()
    where id = r.id;

    if r.quote_id is not null then
      update public.quotes
      set shipping_cost_per_unit_cad = round(v_per_unit,6),
          shipping_allocation_method = v_sh.allocation_method,
          shipping_cost_basis = 'shipment_allocation',
          landed_cost_cad = null
      where id = r.quote_id;
    end if;

    v_allocated_total := v_allocated_total + v_alloc;
    v_count := v_count + 1;
  end loop;

  if v_sh.allocation_method <> 'manual' then
    v_residual := round(v_target_cad - v_allocated_total,2);

    if v_residual <> 0 then
      update public.shipment_items
      set allocated_shipping_cad = allocated_shipping_cad + v_residual,
          updated_at = now()
      where id = v_adjust_item_id
      returning allocated_shipping_cad into v_adjust_alloc;

      if v_adjust_alloc < 0 then
        raise exception 'Freight rounding adjustment produced a negative allocation';
      end if;

      if v_adjust_quote_id is not null then
        update public.quotes
        set shipping_cost_per_unit_cad = round(
              case when v_adjust_qty > 0 then v_adjust_alloc / v_adjust_qty else 0 end,
              6
            ),
            shipping_allocation_method = v_sh.allocation_method,
            shipping_cost_basis = 'shipment_allocation',
            landed_cost_cad = null
        where id = v_adjust_quote_id;
      end if;

      v_allocated_total := v_allocated_total + v_residual;
    end if;
  end if;

  return jsonb_build_object(
    'shipment_id', p_shipment_id,
    'allocation_method', v_sh.allocation_method,
    'freight_cad', v_target_cad,
    'allocated_cad', round(v_allocated_total,2),
    'rounding_adjustment_cad', v_residual,
    'item_lines', v_count
  );
end;
$$;

revoke execute on function public.apply_shipment_freight(uuid) from public;
revoke execute on function public.apply_shipment_freight(uuid) from anon;
grant execute on function public.apply_shipment_freight(uuid) to authenticated;
