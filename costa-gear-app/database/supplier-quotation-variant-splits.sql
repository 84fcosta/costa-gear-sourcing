-- Operational variant splits for supplier quotation lines.
-- The original supplier line remains intact. Variant rows drive quote, PO, inventory and sales identity.

create table if not exists public.supplier_quotation_line_variants (
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null references public.supplier_quotation_lines(id) on delete cascade,
  supplier_variant text not null,
  quantity numeric not null check (quantity > 0 and quantity = trunc(quantity)),
  product_id uuid not null references public.products(id),
  quote_id uuid references public.quotes(id) on delete set null,
  allocated_shipping_cad numeric,
  allocated_shipping_per_unit_cad numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_quotation_line_variants_uk unique(line_id,supplier_variant)
);

alter table public.supplier_quotation_line_variants enable row level security;

drop policy if exists "app members read quotation variants" on public.supplier_quotation_line_variants;
create policy "app members read quotation variants"
on public.supplier_quotation_line_variants for select to authenticated
using (exists(select 1 from public.app_members m where m.user_id=(select auth.uid())));

drop policy if exists "app members insert quotation variants" on public.supplier_quotation_line_variants;
create policy "app members insert quotation variants"
on public.supplier_quotation_line_variants for insert to authenticated
with check (exists(select 1 from public.app_members m where m.user_id=(select auth.uid())));

drop policy if exists "app members update quotation variants" on public.supplier_quotation_line_variants;
create policy "app members update quotation variants"
on public.supplier_quotation_line_variants for update to authenticated
using (exists(select 1 from public.app_members m where m.user_id=(select auth.uid())))
with check (exists(select 1 from public.app_members m where m.user_id=(select auth.uid())));

drop policy if exists "app members delete quotation variants" on public.supplier_quotation_line_variants;
create policy "app members delete quotation variants"
on public.supplier_quotation_line_variants for delete to authenticated
using (exists(select 1 from public.app_members m where m.user_id=(select auth.uid())));

create table if not exists public.supplier_product_variant_mappings (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  supplier_sku text not null,
  supplier_variant text not null,
  product_id uuid not null references public.products(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_product_variant_mappings_uk unique(supplier_id,supplier_sku,supplier_variant)
);

alter table public.supplier_product_variant_mappings enable row level security;

drop policy if exists "app members read variant mappings" on public.supplier_product_variant_mappings;
create policy "app members read variant mappings"
on public.supplier_product_variant_mappings for select to authenticated
using (exists(select 1 from public.app_members m where m.user_id=(select auth.uid())));

drop policy if exists "app members write variant mappings" on public.supplier_product_variant_mappings;
create policy "app members write variant mappings"
on public.supplier_product_variant_mappings for all to authenticated
using (exists(select 1 from public.app_members m where m.user_id=(select auth.uid())))
with check (exists(select 1 from public.app_members m where m.user_id=(select auth.uid())));

alter table public.quotes
  add column if not exists quotation_line_variant_id uuid references public.supplier_quotation_line_variants(id) on delete set null,
  add column if not exists supplier_variant text;

create unique index if not exists idx_quotes_quotation_line_variant_unique
on public.quotes(quotation_line_variant_id)
where quotation_line_variant_id is not null;

alter table public.purchase_order_items
  add column if not exists supplier_variant text;

create or replace function public.set_supplier_quotation_line_variants(
  p_line_id uuid,
  p_variants jsonb
)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  v_line public.supplier_quotation_lines;
  v_q public.supplier_quotations;
  v_item jsonb;
  v_product_id uuid;
  v_variant text;
  v_qty numeric;
  v_sum numeric := 0;
  v_count integer := 0;
begin
  if not exists(select 1 from public.app_members m where m.user_id=(select auth.uid())) then
    raise exception 'Not authorized.';
  end if;

  select * into v_line
  from public.supplier_quotation_lines
  where id=p_line_id
  for update;
  if not found then raise exception 'Quotation line not found.'; end if;

  select * into v_q
  from public.supplier_quotations
  where id=v_line.quotation_id
  for update;
  if not found then raise exception 'Supplier quotation not found.'; end if;
  if v_q.status<>'Imported' then
    raise exception 'Variant splits can only be edited while the quotation is Imported.';
  end if;

  if coalesce(jsonb_typeof(p_variants),'')<>'array' or jsonb_array_length(p_variants)<2 then
    raise exception 'Add at least two variants.';
  end if;

  for v_item in select value from jsonb_array_elements(p_variants)
  loop
    v_variant := nullif(trim(v_item->>'supplierVariant'),'');
    v_qty := nullif(v_item->>'quantity','')::numeric;
    v_product_id := nullif(v_item->>'productId','')::uuid;

    if v_variant is null then raise exception 'Supplier Variant is required for every split row.'; end if;
    if v_qty is null or v_qty<=0 or v_qty<>trunc(v_qty) then
      raise exception 'Every variant quantity must be a positive whole number.';
    end if;
    if v_product_id is null or not exists(select 1 from public.products p where p.id=v_product_id) then
      raise exception 'Select a valid Costa Gear product for every variant.';
    end if;

    v_sum := v_sum + v_qty;
    v_count := v_count + 1;
  end loop;

  if v_sum <> v_line.quantity then
    raise exception 'Variant quantities must total the supplier line quantity %. Current total is %.', v_line.quantity, v_sum;
  end if;

  if (
    select count(distinct lower(trim(value->>'supplierVariant')))
    from jsonb_array_elements(p_variants)
  ) <> v_count then
    raise exception 'Supplier Variant names must be unique within the supplier line.';
  end if;

  delete from public.supplier_quotation_line_variants
  where line_id=p_line_id;

  if nullif(trim(v_line.supplier_sku),'') is not null then
    delete from public.supplier_product_mappings
    where supplier_id=v_q.supplier_id
      and supplier_sku=v_line.supplier_sku;
  end if;

  for v_item in select value from jsonb_array_elements(p_variants)
  loop
    v_variant := trim(v_item->>'supplierVariant');
    v_qty := (v_item->>'quantity')::numeric;
    v_product_id := (v_item->>'productId')::uuid;

    insert into public.supplier_quotation_line_variants(
      line_id,supplier_variant,quantity,product_id
    ) values (
      p_line_id,v_variant,v_qty,v_product_id
    );

    if nullif(trim(v_line.supplier_sku),'') is not null then
      insert into public.supplier_product_variant_mappings(
        supplier_id,supplier_sku,supplier_variant,product_id
      ) values (
        v_q.supplier_id,v_line.supplier_sku,v_variant,v_product_id
      )
      on conflict(supplier_id,supplier_sku,supplier_variant)
      do update set product_id=excluded.product_id,updated_at=now();
    end if;
  end loop;

  update public.supplier_quotation_lines
  set product_id=null,
      match_status='SPLIT',
      quote_id=null,
      updated_at=now()
  where id=p_line_id;

  return (
    select jsonb_agg(to_jsonb(v) order by v.supplier_variant)
    from public.supplier_quotation_line_variants v
    where v.line_id=p_line_id
  );
end;
$function$;

revoke all on function public.set_supplier_quotation_line_variants(uuid,jsonb) from public, anon;
grant execute on function public.set_supplier_quotation_line_variants(uuid,jsonb) to authenticated;

create or replace function public.map_supplier_quotation_line(p_line_id uuid, p_product_id uuid)
returns public.supplier_quotation_lines
language plpgsql
set search_path to 'public'
as $function$
declare
  v_line public.supplier_quotation_lines;
  v_supplier_id uuid;
  v_product public.products;
begin
  if not exists (select 1 from public.app_members m where m.user_id=(select auth.uid())) then
    raise exception 'Not authorized.';
  end if;

  select * into v_product from public.products where id=p_product_id;
  if not found then raise exception 'Invalid Costa Gear product.'; end if;

  select * into v_line from public.supplier_quotation_lines where id=p_line_id;
  if not found then raise exception 'Quotation line not found.'; end if;

  select supplier_id into v_supplier_id
  from public.supplier_quotations
  where id=v_line.quotation_id;

  delete from public.supplier_quotation_line_variants where line_id=p_line_id;

  update public.supplier_quotation_lines
  set product_id=p_product_id,match_status='MATCHED',updated_at=now()
  where id=p_line_id
  returning * into v_line;

  if nullif(trim(v_line.supplier_sku),'') is not null then
    delete from public.supplier_product_variant_mappings
    where supplier_id=v_supplier_id and supplier_sku=v_line.supplier_sku;

    insert into public.supplier_product_mappings(supplier_id,supplier_sku,product_id)
    values(v_supplier_id,v_line.supplier_sku,p_product_id)
    on conflict(supplier_id,supplier_sku)
    do update set product_id=excluded.product_id,updated_at=now();
  end if;

  if v_line.quote_id is not null then
    update public.quotes
    set product_id=p_product_id,cg_sku=v_product.sku_id,product_name=v_product.name
    where id=v_line.quote_id;
  end if;

  return v_line;
end;
$function$;

create or replace function public.finalize_supplier_quotation(
  p_quotation_id uuid,
  p_usd_cad_rate numeric,
  p_allocation_method text default 'value',
  p_duty_rate_pct numeric default null
)
returns public.supplier_quotations
language plpgsql
set search_path to 'public'
as $function$
declare
  v_q public.supplier_quotations;
  v_l public.supplier_quotation_lines;
  v_v public.supplier_quotation_line_variants;
  v_p public.products;
  v_supplier public.suppliers;
  v_item record;
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
  if not exists(select 1 from public.app_members m where m.user_id=(select auth.uid())) then
    raise exception 'Not authorized.';
  end if;

  select * into v_q
  from public.supplier_quotations
  where id=p_quotation_id
  for update;

  if not found then raise exception 'Supplier quotation not found.'; end if;
  if v_q.status='Cancelled' then raise exception 'Cancelled quotations cannot be finalized.'; end if;
  if upper(v_q.currency)<>'USD' then raise exception 'The MVP currently finalizes supplier quotations priced in USD only.'; end if;
  if p_usd_cad_rate is null or p_usd_cad_rate<=0 then raise exception 'Enter a valid USD/CAD rate before finalizing.'; end if;
  if p_allocation_method not in ('value','quantity','weight','volume','equal') then raise exception 'Invalid shipping allocation method.'; end if;

  if exists(
    select 1
    from public.supplier_quotation_lines l
    where l.quotation_id=p_quotation_id
      and (
        l.match_status not in ('MATCHED','IGNORED','SPLIT')
        or (l.match_status='MATCHED' and l.product_id is null)
        or (
          l.match_status='SPLIT'
          and (
            not exists(select 1 from public.supplier_quotation_line_variants v where v.line_id=l.id)
            or (select coalesce(sum(v.quantity),0) from public.supplier_quotation_line_variants v where v.line_id=l.id) <> l.quantity
          )
        )
      )
  ) then
    raise exception 'Resolve every quotation line by matching, splitting into variants, or ignoring it.';
  end if;

  if not exists(
    select 1
    from public.supplier_quotation_lines l
    where l.quotation_id=p_quotation_id
      and (
        (l.match_status='MATCHED' and l.product_id is not null)
        or (l.match_status='SPLIT' and exists(select 1 from public.supplier_quotation_line_variants v where v.line_id=l.id))
      )
  ) then
    raise exception 'At least one quotation line must be matched before finalizing.';
  end if;

  if exists(
    select 1 from public.supplier_quotation_lines
    where quotation_id=p_quotation_id and line_validation='REVIEW REQUIRED'
  ) then
    raise exception 'Resolve line validation exceptions before finalizing.';
  end if;

  if v_q.validation_status='REVIEW REQUIRED' then
    raise exception 'Resolve quotation total validation before finalizing.';
  end if;

  select * into v_supplier from public.suppliers where id=v_q.supplier_id;

  for v_item in
    select l.id as line_id,null::uuid as variant_id,l.product_id,l.quantity as qty,l.unit_price
    from public.supplier_quotation_lines l
    where l.quotation_id=p_quotation_id and l.match_status='MATCHED' and l.product_id is not null
    union all
    select l.id,v.id,v.product_id,v.quantity,l.unit_price
    from public.supplier_quotation_lines l
    join public.supplier_quotation_line_variants v on v.line_id=l.id
    where l.quotation_id=p_quotation_id and l.match_status='SPLIT'
  loop
    select * into v_p from public.products where id=v_item.product_id;
    v_basis := case p_allocation_method
      when 'value' then v_item.qty*v_item.unit_price
      when 'quantity' then v_item.qty
      when 'equal' then 1
      when 'weight' then coalesce(v_p.weight_kg,0)*v_item.qty
      when 'volume' then coalesce(v_p.length_cm,0)*coalesce(v_p.width_cm,0)*coalesce(v_p.height_cm,0)*v_item.qty
    end;
    if p_allocation_method in ('weight','volume') and coalesce(v_basis,0)<=0 then
      raise exception 'Product % is missing the dimensions/weight required for the selected allocation method.', v_p.sku_id;
    end if;
    v_total_basis := v_total_basis + coalesce(v_basis,0);
  end loop;

  if v_q.shipping_total is not null and v_q.shipping_total>0 and v_total_basis<=0 then
    raise exception 'Unable to allocate quotation shipping.';
  end if;

  if v_q.shipping_total is null then
    v_shipping_known := upper(coalesce(v_q.incoterm,''))='DDP';
    v_shipping_cad := 0;
  else
    if upper(coalesce(v_q.shipping_currency,'USD'))='USD' then
      v_shipping_cad := v_q.shipping_total*p_usd_cad_rate;
    elsif upper(v_q.shipping_currency)='CAD' then
      v_shipping_cad := v_q.shipping_total;
    else
      raise exception 'Shipping currency must be USD or CAD for MVP finalization.';
    end if;
    v_shipping_known := true;
  end if;

  v_duty_known := p_duty_rate_pct is not null or upper(coalesce(v_q.incoterm,''))='DDP';

  update public.supplier_quotation_lines
  set allocated_shipping_cad=null,allocated_shipping_per_unit_cad=null,quote_id=null
  where quotation_id=p_quotation_id and match_status='IGNORED';

  for v_l in
    select * from public.supplier_quotation_lines
    where quotation_id=p_quotation_id and match_status='MATCHED' and product_id is not null
    order by line_no
  loop
    select * into v_p from public.products where id=v_l.product_id;

    select coalesce(brokerage_cad,0),coalesce(other_fees_cad,0)
    into v_existing_brokerage,v_existing_other_fees
    from public.quotes
    where quotation_line_id=v_l.id
    limit 1;
    if not found then v_existing_brokerage:=0; v_existing_other_fees:=0; end if;

    v_basis := case p_allocation_method
      when 'value' then v_l.quantity*v_l.unit_price
      when 'quantity' then v_l.quantity
      when 'equal' then 1
      when 'weight' then coalesce(v_p.weight_kg,0)*v_l.quantity
      when 'volume' then coalesce(v_p.length_cm,0)*coalesce(v_p.width_cm,0)*coalesce(v_p.height_cm,0)*v_l.quantity
    end;

    v_alloc := case
      when v_shipping_known and v_q.shipping_total is not null and v_q.shipping_total>0 then v_shipping_cad*(v_basis/v_total_basis)
      when v_shipping_known then 0
      else null
    end;
    v_per_unit := case when v_alloc is null then null else v_alloc/v_l.quantity end;
    v_product_cad := v_l.unit_price*p_usd_cad_rate;
    v_duty := case
      when p_duty_rate_pct is not null then v_product_cad*(p_duty_rate_pct/100)
      when upper(coalesce(v_q.incoterm,''))='DDP' then 0
      else null
    end;
    v_landed := case
      when v_shipping_known and v_duty_known then v_product_cad+coalesce(v_per_unit,0)+coalesce(v_duty,0)+coalesce(v_existing_brokerage,0)+coalesce(v_existing_other_fees,0)
      else null
    end;

    insert into public.quotes(
      product_id,supplier_id,cg_sku,product_name,supplier_sku,supplier_name,unit_price,moq,incoterm,
      shipping_method,notes,quote_date,quote_status,shipping_cost,shipping_currency,shipping_cost_basis,
      shipping_allocation_method,shipping_cost_per_unit_cad,usd_cad_rate,duty_rate_pct,brokerage_cad,other_fees_cad,
      landed_cost_cad,supplier_quotation_id,quotation_line_id,quotation_line_variant_id,supplier_variant,
      quoted_quantity,quoted_unit,supplier_line_total
    ) values (
      v_l.product_id,v_q.supplier_id,v_p.sku_id,v_p.name,v_l.supplier_sku,v_supplier.name,v_l.unit_price,null,v_q.incoterm,
      v_q.shipping_method,concat_ws(' | ',nullif(v_l.original_notes,''),'Imported from supplier quotation '||v_q.quote_ref),v_q.quote_date,
      'Received',null,v_q.shipping_currency,'Quotation Total',p_allocation_method,v_per_unit,p_usd_cad_rate,
      case when p_duty_rate_pct is not null then p_duty_rate_pct when upper(coalesce(v_q.incoterm,''))='DDP' then 0 else null end,
      v_existing_brokerage,v_existing_other_fees,v_landed,v_q.id,v_l.id,null,null,
      v_l.quantity,v_l.unit,v_l.supplier_line_total
    )
    on conflict(quotation_line_id) where quotation_line_id is not null do update set
      product_id=excluded.product_id,supplier_id=excluded.supplier_id,cg_sku=excluded.cg_sku,product_name=excluded.product_name,
      supplier_sku=excluded.supplier_sku,supplier_name=excluded.supplier_name,unit_price=excluded.unit_price,incoterm=excluded.incoterm,
      shipping_method=excluded.shipping_method,notes=excluded.notes,quote_date=excluded.quote_date,quote_status=excluded.quote_status,
      shipping_currency=excluded.shipping_currency,shipping_cost_basis=excluded.shipping_cost_basis,
      shipping_allocation_method=excluded.shipping_allocation_method,shipping_cost_per_unit_cad=excluded.shipping_cost_per_unit_cad,
      usd_cad_rate=excluded.usd_cad_rate,duty_rate_pct=excluded.duty_rate_pct,brokerage_cad=excluded.brokerage_cad,
      other_fees_cad=excluded.other_fees_cad,landed_cost_cad=excluded.landed_cost_cad,quoted_quantity=excluded.quoted_quantity,
      quoted_unit=excluded.quoted_unit,supplier_line_total=excluded.supplier_line_total,supplier_variant=null,
      quotation_line_variant_id=null,updated_at=now()
    returning id into v_quote_id;

    update public.supplier_quotation_lines
    set allocated_shipping_cad=v_alloc,allocated_shipping_per_unit_cad=v_per_unit,quote_id=v_quote_id
    where id=v_l.id;
  end loop;

  for v_l in
    select * from public.supplier_quotation_lines
    where quotation_id=p_quotation_id and match_status='SPLIT'
    order by line_no
  loop
    delete from public.quotes
    where quotation_line_id=v_l.id;

    update public.supplier_quotation_lines
    set quote_id=null
    where id=v_l.id;

    for v_v in
      select * from public.supplier_quotation_line_variants
      where line_id=v_l.id
      order by supplier_variant
    loop
      select * into v_p from public.products where id=v_v.product_id;

      select coalesce(brokerage_cad,0),coalesce(other_fees_cad,0)
      into v_existing_brokerage,v_existing_other_fees
      from public.quotes
      where quotation_line_variant_id=v_v.id
      limit 1;
      if not found then v_existing_brokerage:=0; v_existing_other_fees:=0; end if;

      v_basis := case p_allocation_method
        when 'value' then v_v.quantity*v_l.unit_price
        when 'quantity' then v_v.quantity
        when 'equal' then 1
        when 'weight' then coalesce(v_p.weight_kg,0)*v_v.quantity
        when 'volume' then coalesce(v_p.length_cm,0)*coalesce(v_p.width_cm,0)*coalesce(v_p.height_cm,0)*v_v.quantity
      end;

      v_alloc := case
        when v_shipping_known and v_q.shipping_total is not null and v_q.shipping_total>0 then v_shipping_cad*(v_basis/v_total_basis)
        when v_shipping_known then 0
        else null
      end;
      v_per_unit := case when v_alloc is null then null else v_alloc/v_v.quantity end;
      v_product_cad := v_l.unit_price*p_usd_cad_rate;
      v_duty := case
        when p_duty_rate_pct is not null then v_product_cad*(p_duty_rate_pct/100)
        when upper(coalesce(v_q.incoterm,''))='DDP' then 0
        else null
      end;
      v_landed := case
        when v_shipping_known and v_duty_known then v_product_cad+coalesce(v_per_unit,0)+coalesce(v_duty,0)+coalesce(v_existing_brokerage,0)+coalesce(v_existing_other_fees,0)
        else null
      end;

      insert into public.quotes(
        product_id,supplier_id,cg_sku,product_name,supplier_sku,supplier_name,unit_price,moq,incoterm,
        shipping_method,notes,quote_date,quote_status,shipping_cost,shipping_currency,shipping_cost_basis,
        shipping_allocation_method,shipping_cost_per_unit_cad,usd_cad_rate,duty_rate_pct,brokerage_cad,other_fees_cad,
        landed_cost_cad,supplier_quotation_id,quotation_line_id,quotation_line_variant_id,supplier_variant,
        quoted_quantity,quoted_unit,supplier_line_total
      ) values (
        v_v.product_id,v_q.supplier_id,v_p.sku_id,v_p.name,v_l.supplier_sku,v_supplier.name,v_l.unit_price,null,v_q.incoterm,
        v_q.shipping_method,concat_ws(' | ',nullif(v_l.original_notes,''),'Supplier Variant: '||v_v.supplier_variant,'Imported from supplier quotation '||v_q.quote_ref),v_q.quote_date,
        'Received',null,v_q.shipping_currency,'Quotation Total',p_allocation_method,v_per_unit,p_usd_cad_rate,
        case when p_duty_rate_pct is not null then p_duty_rate_pct when upper(coalesce(v_q.incoterm,''))='DDP' then 0 else null end,
        v_existing_brokerage,v_existing_other_fees,v_landed,v_q.id,null,v_v.id,v_v.supplier_variant,
        v_v.quantity,v_l.unit,v_v.quantity*v_l.unit_price
      )
      on conflict(quotation_line_variant_id) where quotation_line_variant_id is not null do update set
        product_id=excluded.product_id,supplier_id=excluded.supplier_id,cg_sku=excluded.cg_sku,product_name=excluded.product_name,
        supplier_sku=excluded.supplier_sku,supplier_name=excluded.supplier_name,unit_price=excluded.unit_price,incoterm=excluded.incoterm,
        shipping_method=excluded.shipping_method,notes=excluded.notes,quote_date=excluded.quote_date,quote_status=excluded.quote_status,
        shipping_currency=excluded.shipping_currency,shipping_cost_basis=excluded.shipping_cost_basis,
        shipping_allocation_method=excluded.shipping_allocation_method,shipping_cost_per_unit_cad=excluded.shipping_cost_per_unit_cad,
        usd_cad_rate=excluded.usd_cad_rate,duty_rate_pct=excluded.duty_rate_pct,brokerage_cad=excluded.brokerage_cad,
        other_fees_cad=excluded.other_fees_cad,landed_cost_cad=excluded.landed_cost_cad,quoted_quantity=excluded.quoted_quantity,
        quoted_unit=excluded.quoted_unit,supplier_line_total=excluded.supplier_line_total,
        supplier_variant=excluded.supplier_variant,updated_at=now()
      returning id into v_quote_id;

      update public.supplier_quotation_line_variants
      set allocated_shipping_cad=v_alloc,
          allocated_shipping_per_unit_cad=v_per_unit,
          quote_id=v_quote_id,
          updated_at=now()
      where id=v_v.id;
    end loop;

    update public.supplier_quotation_lines l
    set allocated_shipping_cad=(
          select sum(v.allocated_shipping_cad)
          from public.supplier_quotation_line_variants v
          where v.line_id=l.id
        ),
        allocated_shipping_per_unit_cad=(
          select case when l.quantity>0 then sum(v.allocated_shipping_cad)/l.quantity else null end
          from public.supplier_quotation_line_variants v
          where v.line_id=l.id
        )
    where l.id=v_l.id;
  end loop;

  update public.supplier_quotations
  set usd_cad_rate=p_usd_cad_rate,
      allocation_method=p_allocation_method,
      duty_rate_pct=case
        when p_duty_rate_pct is not null then p_duty_rate_pct
        when upper(coalesce(incoterm,''))='DDP' then 0
        else null
      end,
      status='Finalized'
  where id=p_quotation_id
  returning * into v_q;

  return v_q;
end;
$function$;

create or replace function public.create_buying_draft_from_quotation(
  p_quotation_id uuid,
  p_line_ids uuid[]
)
returns public.purchase_orders
language plpgsql
set search_path to 'public'
as $function$
declare
  v_q public.supplier_quotations;
  v_po public.purchase_orders;
  v_l public.supplier_quotation_lines;
  v_v public.supplier_quotation_line_variants;
  v_quote public.quotes;
  v_product public.products;
  v_count integer;
  v_ref text;
begin
  if not exists(select 1 from public.app_members m where m.user_id=(select auth.uid())) then
    raise exception 'Not authorized.';
  end if;

  select * into v_q from public.supplier_quotations where id=p_quotation_id for update;
  if not found then raise exception 'Supplier quotation not found.'; end if;
  if v_q.status<>'Finalized' then raise exception 'Finalize the quotation before creating a buying draft.'; end if;
  if v_q.purchase_order_id is not null then raise exception 'This quotation already has a Buying Draft.'; end if;

  v_count := coalesce(array_length(p_line_ids,1),0);
  if v_count=0 then raise exception 'Select at least one quotation line.'; end if;

  if (select count(*) from public.supplier_quotation_lines l where l.quotation_id=p_quotation_id and l.id=any(p_line_ids))<>v_count then
    raise exception 'One or more selected lines do not belong to this quotation.';
  end if;

  if exists(
    select 1
    from public.supplier_quotation_lines l
    where l.quotation_id=p_quotation_id
      and l.id=any(p_line_ids)
      and (
        (l.match_status='MATCHED' and (l.product_id is null or l.quote_id is null))
        or (
          l.match_status='SPLIT'
          and not exists(
            select 1 from public.supplier_quotation_line_variants v
            where v.line_id=l.id and v.product_id is not null and v.quote_id is not null
          )
        )
        or l.match_status not in ('MATCHED','SPLIT')
      )
  ) then
    raise exception 'Selected lines must have matched products and complete landed cost.';
  end if;

  if exists(
    select 1 from public.supplier_quotation_lines l
    where l.quotation_id=p_quotation_id and l.id=any(p_line_ids) and l.quantity<>trunc(l.quantity)
  ) then
    raise exception 'Purchase order quantities must be whole units.';
  end if;

  v_ref := 'PO-'||to_char(now(),'YYYYMMDD-HH24MISS')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,4));
  insert into public.purchase_orders(po_ref,supplier_id,status,currency,usd_cad_rate,incoterm,payment_terms,notes,created_by)
  values(v_ref,v_q.supplier_id,'Draft',v_q.currency,v_q.usd_cad_rate,v_q.incoterm,v_q.payment_terms,
    'Created from supplier quotation '||v_q.quote_ref||'.',(select auth.uid()))
  returning * into v_po;

  for v_l in
    select * from public.supplier_quotation_lines
    where quotation_id=p_quotation_id and id=any(p_line_ids)
    order by line_no
  loop
    if v_l.match_status='MATCHED' then
      select * into v_quote from public.quotes where id=v_l.quote_id;
      select * into v_product from public.products where id=v_l.product_id;

      insert into public.purchase_order_items(
        purchase_order_id,product_id,quote_id,quantity,moq_text,supplier_sku,supplier_variant,
        unit_price_usd,landed_cost_per_unit_cad,target_sell_price_cad,notes
      ) values (
        v_po.id,v_l.product_id,v_l.quote_id,v_l.quantity::integer,null,v_l.supplier_sku,null,
        v_quote.unit_price,v_quote.landed_cost_cad,v_product.target_sell_price_cad,
        'Supplier quotation '||v_q.quote_ref||' line '||v_l.line_no||'.'
      );
    else
      for v_v in
        select * from public.supplier_quotation_line_variants
        where line_id=v_l.id
        order by supplier_variant
      loop
        select * into v_quote from public.quotes where id=v_v.quote_id;
        select * into v_product from public.products where id=v_v.product_id;

        insert into public.purchase_order_items(
          purchase_order_id,product_id,quote_id,quantity,moq_text,supplier_sku,supplier_variant,
          unit_price_usd,landed_cost_per_unit_cad,target_sell_price_cad,notes
        ) values (
          v_po.id,v_v.product_id,v_v.quote_id,v_v.quantity::integer,null,v_l.supplier_sku,v_v.supplier_variant,
          v_quote.unit_price,v_quote.landed_cost_cad,v_product.target_sell_price_cad,
          'Supplier quotation '||v_q.quote_ref||' line '||v_l.line_no||' | Supplier Variant: '||v_v.supplier_variant||'.'
        );
      end loop;
    end if;
  end loop;

  update public.supplier_quotations
  set purchase_order_id=v_po.id,status='Converted'
  where id=p_quotation_id;

  return v_po;
end;
$function$;

-- Repair QUO0004 and its current Draft PO without changing the original supplier quantities.
do $repair$
declare
  v_supplier_id uuid := '47166eb8-c47b-4698-8a17-6446fce17622';
  v_line1 uuid := '183db7b5-2a9e-4ff8-b40c-1279dcf37d1d';
  v_line2 uuid := '9c7fd1a1-3b11-4328-9e4d-2fa4d1de6999';
  v_fl01 uuid := 'b3dc9d27-5800-4d5d-abdc-df9494efd5af';
  v_fl02 uuid := 'a64e2b5c-328e-466f-b712-86db8c29352b';
  v_fl03 uuid := '0997147c-27ac-440e-a17c-f3b23f638f30';
  v_fl04 uuid := '25eb301a-8731-44f4-b054-42b8a19061e6';
  v_v1a uuid;
  v_v1w uuid;
  v_v2a uuid;
  v_v2w uuid;
  v_q1a uuid := 'eaa06572-7cd7-45f0-928e-7336ff98101d';
  v_q2a uuid := '0eef05c8-c1b5-4915-b94e-ad6b4ac8581c';
  v_q1w uuid;
  v_q2w uuid;
  v_po uuid := '360d6ff7-501a-4acb-9d2a-629998adf861';
begin
  if exists(
    select 1 from public.purchase_orders
    where id=v_po and status<>'Draft'
  ) then
    raise exception 'Fog-light repair requires the current buying decision to remain Draft.';
  end if;

  if exists(
    select 1
    from public.shipment_items si
    join public.purchase_order_items poi on poi.id=si.purchase_order_item_id
    where poi.purchase_order_id=v_po
      and poi.supplier_sku in ('YZ-JL-Front Bumper ACC-01','YZ-JL-Front Bumper ACC-02')
  ) then
    raise exception 'Fog-light repair aborted because shipment items already exist.';
  end if;

  insert into public.supplier_quotation_line_variants(line_id,supplier_variant,quantity,product_id,allocated_shipping_cad,allocated_shipping_per_unit_cad)
  values(v_line1,'Amber/Yellow Beam',2,v_fl01,8.725331791799232780496120,4.362665895899616390248060)
  on conflict(line_id,supplier_variant) do update
    set quantity=excluded.quantity,product_id=excluded.product_id,
        allocated_shipping_cad=excluded.allocated_shipping_cad,
        allocated_shipping_per_unit_cad=excluded.allocated_shipping_per_unit_cad,
        updated_at=now()
  returning id into v_v1a;

  insert into public.supplier_quotation_line_variants(line_id,supplier_variant,quantity,product_id,allocated_shipping_cad,allocated_shipping_per_unit_cad)
  values(v_line1,'White Beam',1,v_fl02,4.362665895899616390248060,4.362665895899616390248060)
  on conflict(line_id,supplier_variant) do update
    set quantity=excluded.quantity,product_id=excluded.product_id,
        allocated_shipping_cad=excluded.allocated_shipping_cad,
        allocated_shipping_per_unit_cad=excluded.allocated_shipping_per_unit_cad,
        updated_at=now()
  returning id into v_v1w;

  insert into public.supplier_quotation_line_variants(line_id,supplier_variant,quantity,product_id,allocated_shipping_cad,allocated_shipping_per_unit_cad)
  values(v_line2,'Amber/Yellow Beam',2,v_fl03,8.725331791799232780496120,4.362665895899616390248060)
  on conflict(line_id,supplier_variant) do update
    set quantity=excluded.quantity,product_id=excluded.product_id,
        allocated_shipping_cad=excluded.allocated_shipping_cad,
        allocated_shipping_per_unit_cad=excluded.allocated_shipping_per_unit_cad,
        updated_at=now()
  returning id into v_v2a;

  insert into public.supplier_quotation_line_variants(line_id,supplier_variant,quantity,product_id,allocated_shipping_cad,allocated_shipping_per_unit_cad)
  values(v_line2,'White Beam',1,v_fl04,4.362665895899616390248060,4.362665895899616390248060)
  on conflict(line_id,supplier_variant) do update
    set quantity=excluded.quantity,product_id=excluded.product_id,
        allocated_shipping_cad=excluded.allocated_shipping_cad,
        allocated_shipping_per_unit_cad=excluded.allocated_shipping_per_unit_cad,
        updated_at=now()
  returning id into v_v2w;

  delete from public.supplier_product_mappings
  where supplier_id=v_supplier_id
    and supplier_sku in ('YZ-JL-Front Bumper ACC-01','YZ-JL-Front Bumper ACC-02');

  insert into public.supplier_product_variant_mappings(supplier_id,supplier_sku,supplier_variant,product_id)
  values
    (v_supplier_id,'YZ-JL-Front Bumper ACC-01','Amber/Yellow Beam',v_fl01),
    (v_supplier_id,'YZ-JL-Front Bumper ACC-01','White Beam',v_fl02),
    (v_supplier_id,'YZ-JL-Front Bumper ACC-02','Amber/Yellow Beam',v_fl03),
    (v_supplier_id,'YZ-JL-Front Bumper ACC-02','White Beam',v_fl04)
  on conflict(supplier_id,supplier_sku,supplier_variant)
  do update set product_id=excluded.product_id,updated_at=now();

  update public.quotes
  set quotation_line_id=null,
      quotation_line_variant_id=v_v1a,
      supplier_variant='Amber/Yellow Beam',
      quoted_quantity=2,
      supplier_line_total=48,
      notes=concat_ws(' | ',regexp_replace(notes,'( \| Supplier Variant: [^|]+)?$',''),'Supplier Variant: Amber/Yellow Beam'),
      updated_at=now()
  where id=v_q1a;

  update public.quotes
  set quotation_line_id=null,
      quotation_line_variant_id=v_v2a,
      supplier_variant='Amber/Yellow Beam',
      quoted_quantity=2,
      supplier_line_total=36,
      notes=concat_ws(' | ',regexp_replace(notes,'( \| Supplier Variant: [^|]+)?$',''),'Supplier Variant: Amber/Yellow Beam'),
      updated_at=now()
  where id=v_q2a;

  insert into public.quotes(
    product_id,supplier_id,cg_sku,product_name,supplier_sku,supplier_name,unit_price,moq,incoterm,
    shipping_method,notes,quote_date,quote_status,shipping_cost,shipping_currency,shipping_cost_basis,
    shipping_allocation_method,shipping_cost_per_unit_cad,usd_cad_rate,duty_rate_pct,brokerage_cad,other_fees_cad,
    landed_cost_cad,supplier_quotation_id,quotation_line_id,quotation_line_variant_id,supplier_variant,
    quoted_quantity,quoted_unit,supplier_line_total
  )
  select
    v_fl02,q.supplier_id,'CG-FL-02',(select name from public.products where id=v_fl02),q.supplier_sku,q.supplier_name,q.unit_price,q.moq,q.incoterm,
    q.shipping_method,concat_ws(' | ',q.notes,'Supplier Variant: White Beam'),q.quote_date,q.quote_status,q.shipping_cost,q.shipping_currency,q.shipping_cost_basis,
    q.shipping_allocation_method,q.shipping_cost_per_unit_cad,q.usd_cad_rate,q.duty_rate_pct,q.brokerage_cad,q.other_fees_cad,
    q.landed_cost_cad,q.supplier_quotation_id,null,v_v1w,'White Beam',
    1,q.quoted_unit,24
  from public.quotes q where q.id=v_q1a
  on conflict(quotation_line_variant_id) where quotation_line_variant_id is not null do update
    set product_id=excluded.product_id,cg_sku=excluded.cg_sku,product_name=excluded.product_name,
        supplier_variant=excluded.supplier_variant,quoted_quantity=excluded.quoted_quantity,
        supplier_line_total=excluded.supplier_line_total,landed_cost_cad=excluded.landed_cost_cad,
        shipping_cost_per_unit_cad=excluded.shipping_cost_per_unit_cad,updated_at=now()
  returning id into v_q1w;

  insert into public.quotes(
    product_id,supplier_id,cg_sku,product_name,supplier_sku,supplier_name,unit_price,moq,incoterm,
    shipping_method,notes,quote_date,quote_status,shipping_cost,shipping_currency,shipping_cost_basis,
    shipping_allocation_method,shipping_cost_per_unit_cad,usd_cad_rate,duty_rate_pct,brokerage_cad,other_fees_cad,
    landed_cost_cad,supplier_quotation_id,quotation_line_id,quotation_line_variant_id,supplier_variant,
    quoted_quantity,quoted_unit,supplier_line_total
  )
  select
    v_fl04,q.supplier_id,'CG-FL-04',(select name from public.products where id=v_fl04),q.supplier_sku,q.supplier_name,q.unit_price,q.moq,q.incoterm,
    q.shipping_method,concat_ws(' | ',q.notes,'Supplier Variant: White Beam'),q.quote_date,q.quote_status,q.shipping_cost,q.shipping_currency,q.shipping_cost_basis,
    q.shipping_allocation_method,q.shipping_cost_per_unit_cad,q.usd_cad_rate,q.duty_rate_pct,q.brokerage_cad,q.other_fees_cad,
    q.landed_cost_cad,q.supplier_quotation_id,null,v_v2w,'White Beam',
    1,q.quoted_unit,18
  from public.quotes q where q.id=v_q2a
  on conflict(quotation_line_variant_id) where quotation_line_variant_id is not null do update
    set product_id=excluded.product_id,cg_sku=excluded.cg_sku,product_name=excluded.product_name,
        supplier_variant=excluded.supplier_variant,quoted_quantity=excluded.quoted_quantity,
        supplier_line_total=excluded.supplier_line_total,landed_cost_cad=excluded.landed_cost_cad,
        shipping_cost_per_unit_cad=excluded.shipping_cost_per_unit_cad,updated_at=now()
  returning id into v_q2w;

  update public.supplier_quotation_line_variants
  set quote_id=case
    when id=v_v1a then v_q1a
    when id=v_v1w then v_q1w
    when id=v_v2a then v_q2a
    when id=v_v2w then v_q2w
    else quote_id
  end,
  updated_at=now()
  where id in (v_v1a,v_v1w,v_v2a,v_v2w);

  update public.supplier_quotation_lines
  set product_id=null,match_status='SPLIT',quote_id=null,updated_at=now()
  where id in (v_line1,v_line2);

  update public.purchase_order_items
  set quantity=2,
      supplier_variant='Amber/Yellow Beam',
      target_sell_price_cad=(select target_sell_price_cad from public.products where id=product_id),
      notes=case
        when supplier_sku='YZ-JL-Front Bumper ACC-01' then 'Supplier quotation QUO0004 line 25 | Supplier Variant: Amber/Yellow Beam.'
        else 'Supplier quotation QUO0004 line 26 | Supplier Variant: Amber/Yellow Beam.'
      end,
      updated_at=now()
  where purchase_order_id=v_po
    and supplier_sku in ('YZ-JL-Front Bumper ACC-01','YZ-JL-Front Bumper ACC-02')
    and supplier_variant is null;

  insert into public.purchase_order_items(
    purchase_order_id,product_id,quote_id,quantity,moq_text,supplier_sku,supplier_variant,
    unit_price_usd,landed_cost_per_unit_cad,target_sell_price_cad,notes
  )
  select v_po,v_fl02,v_q1w,1,null,'YZ-JL-Front Bumper ACC-01','White Beam',
         24,38.39,(select target_sell_price_cad from public.products where id=v_fl02),
         'Supplier quotation QUO0004 line 25 | Supplier Variant: White Beam.'
  where not exists(
    select 1 from public.purchase_order_items
    where purchase_order_id=v_po and supplier_sku='YZ-JL-Front Bumper ACC-01' and supplier_variant='White Beam'
  );

  insert into public.purchase_order_items(
    purchase_order_id,product_id,quote_id,quantity,moq_text,supplier_sku,supplier_variant,
    unit_price_usd,landed_cost_per_unit_cad,target_sell_price_cad,notes
  )
  select v_po,v_fl04,v_q2w,1,null,'YZ-JL-Front Bumper ACC-02','White Beam',
         18,29.89,(select target_sell_price_cad from public.products where id=v_fl04),
         'Supplier quotation QUO0004 line 26 | Supplier Variant: White Beam.'
  where not exists(
    select 1 from public.purchase_order_items
    where purchase_order_id=v_po and supplier_sku='YZ-JL-Front Bumper ACC-02' and supplier_variant='White Beam'
  );
end;
$repair$;
