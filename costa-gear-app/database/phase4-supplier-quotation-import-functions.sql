-- Costa Gear standardized supplier quotation import RPCs
-- Applied to production as migration: supplier_quotation_bulk_import_functions

create or replace function public.import_supplier_quotation(
  p_supplier_id uuid,
  p_header jsonb,
  p_lines jsonb
) returns public.supplier_quotations
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_q public.supplier_quotations;
  v_line jsonb;
  v_line_no integer;
  v_supplier_sku text;
  v_cg_sku text;
  v_product_id uuid;
  v_qty numeric;
  v_unit_price numeric;
  v_supplier_total numeric;
  v_calc_total numeric;
  v_line_validation text;
  v_sum numeric := 0;
  v_has_totals boolean := false;
  v_header_validation text := 'NOT CHECKED';
begin
  if not exists (select 1 from public.app_members m where m.user_id = auth.uid()) then
    raise exception 'Not authorized for Costa Gear operations.';
  end if;
  if not exists (select 1 from public.suppliers s where s.id=p_supplier_id) then
    raise exception 'Select a valid supplier before importing.';
  end if;
  if coalesce(jsonb_typeof(p_lines),'') <> 'array' or jsonb_array_length(p_lines)=0 then
    raise exception 'The Items sheet contains no importable rows.';
  end if;
  if nullif(trim(p_header->>'quoteRef'),'') is null then
    raise exception 'Supplier Quote Ref is required.';
  end if;
  if exists(select 1 from public.supplier_quotations sq where sq.supplier_id=p_supplier_id and sq.quote_ref=trim(p_header->>'quoteRef')) then
    raise exception 'This supplier quotation has already been imported.';
  end if;

  insert into public.supplier_quotations(
    supplier_id,quote_ref,quote_date,currency,incoterm,shipping_method,shipping_total,shipping_currency,
    product_subtotal,grand_total,transit_time_days,dispatch_lead_time_days,packaging,payment_terms,notes,
    validation_status,status
  ) values (
    p_supplier_id, trim(p_header->>'quoteRef'), nullif(p_header->>'quoteDate','')::date,
    coalesce(nullif(trim(p_header->>'currency'),''),'USD'), nullif(trim(p_header->>'incoterm'),''),
    nullif(trim(p_header->>'shippingMethod'),''), nullif(p_header->>'shippingTotal','')::numeric,
    coalesce(nullif(trim(p_header->>'shippingCurrency'),''),'USD'), nullif(p_header->>'productSubtotal','')::numeric,
    nullif(p_header->>'grandTotal','')::numeric, nullif(p_header->>'transitTimeDays','')::integer,
    nullif(p_header->>'dispatchLeadTimeDays','')::integer, nullif(trim(p_header->>'packaging'),''),
    nullif(trim(p_header->>'paymentTerms'),''), nullif(trim(p_header->>'notes'),''), 'NOT CHECKED','Imported'
  ) returning * into v_q;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_line_no := nullif(v_line->>'line','')::integer;
    if v_line_no is null then raise exception 'Every Items row requires a Line number.'; end if;
    v_qty := nullif(v_line->>'quantity','')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'Line % has an invalid quantity.', v_line_no; end if;
    v_unit_price := nullif(v_line->>'unitPrice','')::numeric;
    if v_unit_price is null or v_unit_price < 0 then raise exception 'Line % has an invalid Unit Price.', v_line_no; end if;
    v_supplier_total := nullif(v_line->>'supplierLineTotal','')::numeric;
    v_calc_total := round(v_qty*v_unit_price, 4);
    if v_supplier_total is null then
      v_line_validation := 'NOT CHECKED';
      v_sum := v_sum + v_calc_total;
    else
      v_has_totals := true;
      v_line_validation := case when abs(v_supplier_total-v_calc_total) < 0.01 then 'PASS' else 'REVIEW REQUIRED' end;
      v_sum := v_sum + v_supplier_total;
    end if;

    v_supplier_sku := nullif(trim(v_line->>'supplierSku'),'');
    v_cg_sku := nullif(trim(v_line->>'cgSku'),'');
    v_product_id := null;

    if v_cg_sku is not null then
      select p.id into v_product_id from public.products p where lower(trim(p.sku_id))=lower(v_cg_sku) limit 1;
    end if;
    if v_product_id is null and v_supplier_sku is not null then
      select m.product_id into v_product_id from public.supplier_product_mappings m
      where m.supplier_id=p_supplier_id and m.supplier_sku=v_supplier_sku limit 1;
    end if;
    if v_product_id is null and v_supplier_sku is not null then
      select min(q.product_id::text)::uuid into v_product_id
      from public.quotes q
      where q.supplier_id=p_supplier_id and q.supplier_sku=v_supplier_sku and q.product_id is not null
      having count(distinct q.product_id)=1;
    end if;

    if v_product_id is not null and v_supplier_sku is not null then
      insert into public.supplier_product_mappings(supplier_id,supplier_sku,product_id)
      values(p_supplier_id,v_supplier_sku,v_product_id)
      on conflict(supplier_id,supplier_sku) do update set product_id=excluded.product_id,updated_at=now();
    end if;

    insert into public.supplier_quotation_lines(
      quotation_id,line_no,supplier_sku,supplier_description,unit,quantity,unit_price,supplier_line_total,
      calculated_line_total,line_validation,original_notes,source_cg_sku,product_id,match_status
    ) values (
      v_q.id,v_line_no,v_supplier_sku,nullif(trim(v_line->>'description'),''),nullif(trim(v_line->>'unit'),''),v_qty,
      v_unit_price,v_supplier_total,v_calc_total,v_line_validation,nullif(trim(v_line->>'notes'),''),v_cg_sku,v_product_id,
      case when v_product_id is not null then 'MATCHED' else 'UNMATCHED' end
    );
  end loop;

  if exists(select 1 from public.supplier_quotation_lines l where l.quotation_id=v_q.id and l.line_validation='REVIEW REQUIRED') then
    v_header_validation := 'REVIEW REQUIRED';
  elsif v_q.product_subtotal is not null and abs(v_q.product_subtotal-v_sum) >= 0.01 then
    v_header_validation := 'REVIEW REQUIRED';
  elsif v_q.grand_total is not null and v_q.product_subtotal is not null and v_q.shipping_total is not null
        and abs(v_q.grand_total-(v_q.product_subtotal+v_q.shipping_total)) >= 0.01 then
    v_header_validation := 'REVIEW REQUIRED';
  elsif v_q.product_subtotal is not null and (v_has_totals or v_sum > 0) then
    v_header_validation := 'PASS';
  else
    v_header_validation := 'NOT CHECKED';
  end if;

  update public.supplier_quotations set validation_status=v_header_validation where id=v_q.id returning * into v_q;
  return v_q;
end;
$$;

create or replace function public.map_supplier_quotation_line(p_line_id uuid,p_product_id uuid)
returns public.supplier_quotation_lines
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_line public.supplier_quotation_lines;
  v_supplier_id uuid;
  v_product public.products;
begin
  if not exists (select 1 from public.app_members m where m.user_id=auth.uid()) then raise exception 'Not authorized.'; end if;
  select * into v_product from public.products where id=p_product_id;
  if not found then raise exception 'Invalid Costa Gear product.'; end if;
  select * into v_line from public.supplier_quotation_lines where id=p_line_id;
  if not found then raise exception 'Quotation line not found.'; end if;
  select supplier_id into v_supplier_id from public.supplier_quotations where id=v_line.quotation_id;

  update public.supplier_quotation_lines set product_id=p_product_id,match_status='MATCHED' where id=p_line_id returning * into v_line;
  if nullif(trim(v_line.supplier_sku),'') is not null then
    insert into public.supplier_product_mappings(supplier_id,supplier_sku,product_id)
    values(v_supplier_id,v_line.supplier_sku,p_product_id)
    on conflict(supplier_id,supplier_sku) do update set product_id=excluded.product_id,updated_at=now();
  end if;
  if v_line.quote_id is not null then
    update public.quotes set product_id=p_product_id,cg_sku=v_product.sku_id,product_name=v_product.name where id=v_line.quote_id;
  end if;
  return v_line;
end;
$$;

create or replace function public.finalize_supplier_quotation(
  p_quotation_id uuid,
  p_usd_cad_rate numeric,
  p_allocation_method text default 'value',
  p_duty_rate_pct numeric default null
) returns public.supplier_quotations
language plpgsql
security invoker
set search_path=public
as $$
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
begin
  if not exists (select 1 from public.app_members m where m.user_id=auth.uid()) then raise exception 'Not authorized.'; end if;
  select * into v_q from public.supplier_quotations where id=p_quotation_id for update;
  if not found then raise exception 'Supplier quotation not found.'; end if;
  if v_q.status='Cancelled' then raise exception 'Cancelled quotations cannot be finalized.'; end if;
  if upper(v_q.currency)<>'USD' then raise exception 'The MVP currently finalizes supplier quotations priced in USD only.'; end if;
  if p_usd_cad_rate is null or p_usd_cad_rate<=0 then raise exception 'Enter a valid USD/CAD rate before finalizing.'; end if;
  if p_allocation_method not in ('value','quantity','weight','volume','equal') then raise exception 'Invalid shipping allocation method.'; end if;
  if exists(select 1 from public.supplier_quotation_lines where quotation_id=p_quotation_id and product_id is null) then
    raise exception 'Match every quotation line to a Costa Gear product before finalizing.';
  end if;
  if exists(select 1 from public.supplier_quotation_lines where quotation_id=p_quotation_id and line_validation='REVIEW REQUIRED') then
    raise exception 'Resolve line validation exceptions before finalizing.';
  end if;
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
    if p_allocation_method in ('weight','volume') and coalesce(v_basis,0)<=0 then
      raise exception 'Product % is missing the dimensions/weight required for the selected allocation method.', v_p.sku_id;
    end if;
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
    v_landed := case when v_shipping_known and v_duty_known then v_product_cad+coalesce(v_per_unit,0)+coalesce(v_duty,0) else null end;

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
      0,0,v_landed,v_q.id,v_l.id,v_l.quantity,v_l.unit,v_l.supplier_line_total
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

    update public.supplier_quotation_lines
    set allocated_shipping_cad=v_alloc,allocated_shipping_per_unit_cad=v_per_unit,quote_id=v_quote_id
    where id=v_l.id;
  end loop;

  update public.supplier_quotations
  set usd_cad_rate=p_usd_cad_rate,
      allocation_method=p_allocation_method,
      duty_rate_pct=case when p_duty_rate_pct is not null then p_duty_rate_pct when upper(coalesce(incoterm,''))='DDP' then 0 else null end,
      status='Finalized'
  where id=p_quotation_id returning * into v_q;
  return v_q;
end;
$$;

create or replace function public.create_buying_draft_from_quotation(p_quotation_id uuid,p_line_ids uuid[])
returns public.purchase_orders
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_q public.supplier_quotations;
  v_po public.purchase_orders;
  v_l public.supplier_quotation_lines;
  v_quote public.quotes;
  v_product public.products;
  v_count integer;
  v_ref text;
begin
  if not exists (select 1 from public.app_members m where m.user_id=auth.uid()) then raise exception 'Not authorized.'; end if;
  select * into v_q from public.supplier_quotations where id=p_quotation_id for update;
  if not found then raise exception 'Supplier quotation not found.'; end if;
  if v_q.status<>'Finalized' then raise exception 'Finalize the quotation before creating a buying draft.'; end if;
  if v_q.purchase_order_id is not null then raise exception 'This quotation already has a Buying Draft.'; end if;
  v_count := coalesce(array_length(p_line_ids,1),0);
  if v_count=0 then raise exception 'Select at least one quotation line.'; end if;
  if (select count(*) from public.supplier_quotation_lines l where l.quotation_id=p_quotation_id and l.id=any(p_line_ids))<>v_count then
    raise exception 'One or more selected lines do not belong to this quotation.';
  end if;
  if exists(select 1 from public.supplier_quotation_lines l left join public.quotes q on q.id=l.quote_id
            where l.quotation_id=p_quotation_id and l.id=any(p_line_ids) and (l.product_id is null or q.id is null or q.landed_cost_cad is null)) then
    raise exception 'Selected lines must have a matched product and complete landed cost.';
  end if;
  if exists(select 1 from public.supplier_quotation_lines l where l.quotation_id=p_quotation_id and l.id=any(p_line_ids) and l.quantity<>trunc(l.quantity)) then
    raise exception 'Purchase order quantities must be whole units.';
  end if;

  v_ref := 'PO-'||to_char(now(),'YYYYMMDD-HH24MISS')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,4));
  insert into public.purchase_orders(po_ref,supplier_id,status,currency,usd_cad_rate,incoterm,payment_terms,notes,created_by)
  values(v_ref,v_q.supplier_id,'Draft',v_q.currency,v_q.usd_cad_rate,v_q.incoterm,v_q.payment_terms,
    'Created from supplier quotation '||v_q.quote_ref||'.',auth.uid()) returning * into v_po;

  for v_l in select * from public.supplier_quotation_lines where quotation_id=p_quotation_id and id=any(p_line_ids) order by line_no loop
    select * into v_quote from public.quotes where id=v_l.quote_id;
    select * into v_product from public.products where id=v_l.product_id;
    insert into public.purchase_order_items(
      purchase_order_id,product_id,quote_id,quantity,moq_text,supplier_sku,unit_price_usd,
      landed_cost_per_unit_cad,target_sell_price_cad,notes
    ) values (
      v_po.id,v_l.product_id,v_l.quote_id,v_l.quantity::integer,null,v_l.supplier_sku,v_quote.unit_price,
      v_quote.landed_cost_cad,v_product.target_sell_price_cad,'Supplier quotation '||v_q.quote_ref||' line '||v_l.line_no||'.'
    );
  end loop;

  update public.supplier_quotations set purchase_order_id=v_po.id,status='Converted' where id=p_quotation_id;
  return v_po;
end;
$$;

revoke all on function public.import_supplier_quotation(uuid,jsonb,jsonb) from public;
revoke all on function public.import_supplier_quotation(uuid,jsonb,jsonb) from anon;
revoke all on function public.map_supplier_quotation_line(uuid,uuid) from public;
revoke all on function public.map_supplier_quotation_line(uuid,uuid) from anon;
revoke all on function public.finalize_supplier_quotation(uuid,numeric,text,numeric) from public;
revoke all on function public.finalize_supplier_quotation(uuid,numeric,text,numeric) from anon;
revoke all on function public.create_buying_draft_from_quotation(uuid,uuid[]) from public;
revoke all on function public.create_buying_draft_from_quotation(uuid,uuid[]) from anon;

grant execute on function public.import_supplier_quotation(uuid,jsonb,jsonb) to authenticated;
grant execute on function public.map_supplier_quotation_line(uuid,uuid) to authenticated;
grant execute on function public.finalize_supplier_quotation(uuid,numeric,text,numeric) to authenticated;
grant execute on function public.create_buying_draft_from_quotation(uuid,uuid[]) to authenticated;
