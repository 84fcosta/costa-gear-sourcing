-- Preserve already-recorded per-unit brokerage and other fees when a finalized
-- supplier quotation is recalculated. This keeps actual payment/import fees from
-- being silently reset by a sourcing-only recalculation.

create or replace function public.finalize_supplier_quotation(
  p_quotation_id uuid,
  p_usd_cad_rate numeric,
  p_allocation_method text default 'value'::text,
  p_duty_rate_pct numeric default null::numeric
)
returns public.supplier_quotations
language plpgsql
set search_path to 'public'
as $function$
declare
  v_q public.supplier_quotations;
  v_l public.supplier_quotation_lines;
  v_p public.products;
  v_supplier public.suppliers;
  v_basis numeric;
  v_total_basis numeric := 0;
  v_shipping_cad numeric;
  v_alloc numeric;
  v_per_unit numeric;
  v_product_cad numeric;
  v_duty numeric;
  v_landed numeric;
  v_shipping_known boolean;
  v_duty_known boolean;
  v_quote_id uuid;
  v_existing_brokerage numeric := 0;
  v_existing_other_fees numeric := 0;
begin
  if not exists (select 1 from public.app_members m where m.user_id=auth.uid()) then raise exception 'Not authorized.'; end if;
  select * into v_q from public.supplier_quotations where id=p_quotation_id for update;
  if not found then raise exception 'Supplier quotation not found.'; end if;
  if v_q.status='Cancelled' then raise exception 'Cancelled quotations cannot be finalized.'; end if;
  if upper(v_q.currency)<>'USD' then raise exception 'The MVP currently finalizes supplier quotations priced in USD only.'; end if;
  if p_usd_cad_rate is null or p_usd_cad_rate<=0 then raise exception 'Enter a valid USD/CAD rate before finalizing.'; end if;
  if p_allocation_method not in ('value','quantity','weight','volume','equal') then raise exception 'Invalid shipping allocation method.'; end if;
  if exists(select 1 from public.supplier_quotation_lines where quotation_id=p_quotation_id and product_id is null) then raise exception 'Match every quotation line to a Costa Gear product before finalizing.'; end if;
  if exists(select 1 from public.supplier_quotation_lines where quotation_id=p_quotation_id and line_validation='REVIEW REQUIRED') then raise exception 'Resolve line validation exceptions before finalizing.'; end if;
  if v_q.validation_status='REVIEW REQUIRED' then raise exception 'Resolve quotation total validation before finalizing.'; end if;
  select * into v_supplier from public.suppliers where id=v_q.supplier_id;

  for v_l in select * from public.supplier_quotation_lines where quotation_id=p_quotation_id order by line_no loop
    select * into v_p from public.products where id=v_l.product_id;
    v_basis := case p_allocation_method
      when 'value' then v_l.quantity*v_l.unit_price
      when 'quantity' then v_l.quantity
      when 'equal' then 1
      when 'weight' then coalesce(v_p.weight_kg,0)*v_l.quantity
      when 'volume' then coalesce(v_p.length_cm,0)*coalesce(v_p.width_cm,0)*coalesce(v_p.height_cm,0)*v_l.quantity
    end;
    if p_allocation_method in ('weight','volume') and coalesce(v_basis,0)<=0 then raise exception 'Product % is missing the dimensions/weight required for the selected allocation method.', v_p.sku_id; end if;
    v_total_basis := v_total_basis + coalesce(v_basis,0);
  end loop;

  if v_q.shipping_total is not null and v_q.shipping_total>0 and v_total_basis<=0 then raise exception 'Unable to allocate quotation shipping.'; end if;
  if v_q.shipping_total is null then
    v_shipping_known := upper(coalesce(v_q.incoterm,''))='DDP';
    v_shipping_cad := 0;
  else
    if upper(coalesce(v_q.shipping_currency,'USD'))='USD' then v_shipping_cad := v_q.shipping_total*p_usd_cad_rate;
    elsif upper(v_q.shipping_currency)='CAD' then v_shipping_cad := v_q.shipping_total;
    else raise exception 'Shipping currency must be USD or CAD for MVP finalization.';
    end if;
    v_shipping_known := true;
  end if;
  v_duty_known := p_duty_rate_pct is not null or upper(coalesce(v_q.incoterm,''))='DDP';

  for v_l in select * from public.supplier_quotation_lines where quotation_id=p_quotation_id order by line_no loop
    select * into v_p from public.products where id=v_l.product_id;
    select coalesce(brokerage_cad,0), coalesce(other_fees_cad,0)
      into v_existing_brokerage, v_existing_other_fees
      from public.quotes where quotation_line_id=v_l.id limit 1;
    if not found then
      v_existing_brokerage := 0;
      v_existing_other_fees := 0;
    end if;

    v_basis := case p_allocation_method
      when 'value' then v_l.quantity*v_l.unit_price
      when 'quantity' then v_l.quantity
      when 'equal' then 1
      when 'weight' then coalesce(v_p.weight_kg,0)*v_l.quantity
      when 'volume' then coalesce(v_p.length_cm,0)*coalesce(v_p.width_cm,0)*coalesce(v_p.height_cm,0)*v_l.quantity
    end;
    v_alloc := case when v_shipping_known and v_q.shipping_total is not null and v_q.shipping_total>0 then v_shipping_cad*(v_basis/v_total_basis) when v_shipping_known then 0 else null end;
    v_per_unit := case when v_alloc is null then null else v_alloc/v_l.quantity end;
    v_product_cad := v_l.unit_price*p_usd_cad_rate;
    v_duty := case when p_duty_rate_pct is not null then v_product_cad*(p_duty_rate_pct/100) when upper(coalesce(v_q.incoterm,''))='DDP' then 0 else null end;
    v_landed := case when v_shipping_known and v_duty_known then v_product_cad+coalesce(v_per_unit,0)+coalesce(v_duty,0)+coalesce(v_existing_brokerage,0)+coalesce(v_existing_other_fees,0) else null end;

    insert into public.quotes(
      product_id,supplier_id,cg_sku,product_name,supplier_sku,supplier_name,unit_price,moq,incoterm,
      shipping_method,notes,quote_date,quote_status,shipping_cost,shipping_currency,shipping_cost_basis,
      shipping_allocation_method,shipping_cost_per_unit_cad,usd_cad_rate,duty_rate_pct,brokerage_cad,other_fees_cad,
      landed_cost_cad,supplier_quotation_id,quotation_line_id,quoted_quantity,quoted_unit,supplier_line_total
    ) values (
      v_l.product_id,v_q.supplier_id,v_p.sku_id,v_p.name,v_l.supplier_sku,v_supplier.name,v_l.unit_price,null,v_q.incoterm,
      v_q.shipping_method,concat_ws(' | ',nullif(v_l.original_notes,''),'Imported from supplier quotation '||v_q.quote_ref),v_q.quote_date,
      'Received',null,v_q.shipping_currency,'Quotation Total',p_allocation_method,v_per_unit,p_usd_cad_rate,
      case when p_duty_rate_pct is not null then p_duty_rate_pct when upper(coalesce(v_q.incoterm,''))='DDP' then 0 else null end,
      v_existing_brokerage,v_existing_other_fees,v_landed,v_q.id,v_l.id,v_l.quantity,v_l.unit,v_l.supplier_line_total
    )
    on conflict (quotation_line_id) where quotation_line_id is not null do update set
      product_id=excluded.product_id,supplier_id=excluded.supplier_id,cg_sku=excluded.cg_sku,product_name=excluded.product_name,
      supplier_sku=excluded.supplier_sku,supplier_name=excluded.supplier_name,unit_price=excluded.unit_price,incoterm=excluded.incoterm,
      shipping_method=excluded.shipping_method,notes=excluded.notes,quote_date=excluded.quote_date,quote_status=excluded.quote_status,
      shipping_currency=excluded.shipping_currency,shipping_cost_basis=excluded.shipping_cost_basis,
      shipping_allocation_method=excluded.shipping_allocation_method,shipping_cost_per_unit_cad=excluded.shipping_cost_per_unit_cad,
      usd_cad_rate=excluded.usd_cad_rate,duty_rate_pct=excluded.duty_rate_pct,brokerage_cad=excluded.brokerage_cad,
      other_fees_cad=excluded.other_fees_cad,landed_cost_cad=excluded.landed_cost_cad,quoted_quantity=excluded.quoted_quantity,
      quoted_unit=excluded.quoted_unit,supplier_line_total=excluded.supplier_line_total,updated_at=now()
    returning id into v_quote_id;

    update public.supplier_quotation_lines set allocated_shipping_cad=v_alloc,allocated_shipping_per_unit_cad=v_per_unit,quote_id=v_quote_id where id=v_l.id;
  end loop;

  update public.supplier_quotations set usd_cad_rate=p_usd_cad_rate,allocation_method=p_allocation_method,
    duty_rate_pct=case when p_duty_rate_pct is not null then p_duty_rate_pct when upper(coalesce(incoterm,''))='DDP' then 0 else null end,
    status='Finalized'
  where id=p_quotation_id returning * into v_q;
  return v_q;
end;
$function$;
