alter table public.products
  add column if not exists variant_name text,
  add column if not exists legacy_name text;

update public.products
set legacy_name = name
where legacy_name is null
  and name is not null;

create or replace function public.build_costa_gear_product_name(
  p_product_type text,
  p_variant_name text,
  p_material text
)
returns text
language sql
immutable
set search_path to 'public'
as $function$
  select nullif(
    concat_ws(
      ' – ',
      nullif(trim(p_product_type),''),
      nullif(trim(p_variant_name),''),
      nullif(trim(p_material),'')
    ),
    ''
  );
$function$;

insert into public.product_types(name,family_code,active)
select 'Roof Rack Cross Bars','CB',true
where not exists (
  select 1 from public.product_types where lower(name)=lower('Roof Rack Cross Bars')
);

insert into public.product_types(name,family_code,active)
select 'Door Sill Entry Guard Kit','DS',true
where not exists (
  select 1 from public.product_types where lower(name)=lower('Door Sill Entry Guard Kit')
);

insert into public.product_types(name,family_code,active)
select 'All-Weather Floor Mat Set','FM',true
where not exists (
  select 1 from public.product_types where lower(name)=lower('All-Weather Floor Mat Set')
);

insert into public.product_types(name,family_code,active)
select 'Dashboard Storage Tray Phone Holder Kit','PH',true
where not exists (
  select 1 from public.product_types where lower(name)=lower('Dashboard Storage Tray Phone Holder Kit')
);

update public.products
set product_type='Roof Rack Cross Bars'
where sku_id in ('CG-CB-01','CG-CB-02');

update public.products
set product_type='Door Sill Entry Guard Kit'
where sku_id in ('CG-DS-01','CG-DS-02');

update public.products
set product_type='All-Weather Floor Mat Set'
where sku_id in ('CG-FM-01','CG-FM-02');

update public.products
set product_type='Dashboard Storage Tray Phone Holder Kit'
where sku_id in ('CG-PH-04','CG-PH-06');

update public.product_types
set active=false, updated_at=now()
where name in ('Roof Rack Cross Bar','Door Sill Entry Guard','Floor Mat Set');

update public.products
set variant_name = case sku_id
  when 'CG-CB-01' then null
  when 'CG-CB-02' then 'Rounded Ends'
  when 'CG-CR-01' then null
  when 'CG-DS-01' then null
  when 'CG-DS-02' then null
  when 'CG-FM-01' then '4-Door'
  when 'CG-FM-02' then '2-Door'
  when 'CG-PH-01' then null
  when 'CG-PH-02' then 'Side-Clamp Cradle'
  when 'CG-PH-03' then '3-Point Cradle'
  when 'CG-PH-04' then 'Dual Cradle'
  when 'CG-PH-05' then '3-Point Cradle, 2024+ Design'
  when 'CG-PH-06' then 'Dual Cradle, 4xe Variant'
  when 'CG-PH-07' then '3-Point Cradle'
  when 'CG-PH-08' then null
  when 'CG-PH-09' then null
  when 'CG-RB-01' then 'OEM-Style 2-Door'
  when 'CG-RB-02' then 'OEM-Style 4-Door'
  when 'CG-RR-01' then null
  when 'CG-RR-02' then 'Bracket-Mounted'
  when 'CG-RR-03' then 'Bracket-Mounted 140 × 160 cm'
  when 'CG-SK-01' then '4-Piece'
  when 'CG-TT-01' then 'Foldable 2-Tier'
  when 'CG-TT-02' then 'Foldable Single-Tier 76 cm'
  when 'CG-TT-03' then 'Foldable Single-Tier 66.5 cm'
  when 'CG-TT-04' then 'Foldable 2-Tier Cargo Shelf'
  else variant_name
end
where sku_id in (
  'CG-CB-01','CG-CB-02','CG-CR-01','CG-DS-01','CG-DS-02',
  'CG-FM-01','CG-FM-02','CG-PH-01','CG-PH-02','CG-PH-03',
  'CG-PH-04','CG-PH-05','CG-PH-06','CG-PH-07','CG-PH-08',
  'CG-PH-09','CG-RB-01','CG-RB-02','CG-RR-01','CG-RR-02',
  'CG-RR-03','CG-SK-01','CG-TT-01','CG-TT-02','CG-TT-03','CG-TT-04'
);

update public.products
set material=null
where sku_id in ('CG-PH-08','CG-PH-09');

update public.products
set name=public.build_costa_gear_product_name(product_type,variant_name,material)
where sku_id in (
  'CG-CB-01','CG-CB-02','CG-CR-01','CG-DS-01','CG-DS-02',
  'CG-FM-01','CG-FM-02','CG-PH-01','CG-PH-02','CG-PH-03',
  'CG-PH-04','CG-PH-05','CG-PH-06','CG-PH-07','CG-PH-08',
  'CG-PH-09','CG-RB-01','CG-RB-02','CG-RR-01','CG-RR-02',
  'CG-RR-03','CG-SK-01','CG-TT-01','CG-TT-02','CG-TT-03','CG-TT-04'
);

create or replace function public.apply_product_auto_name()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  new.variant_name := nullif(trim(new.variant_name),'');
  new.name := public.build_costa_gear_product_name(
    new.product_type,
    new.variant_name,
    new.material
  );

  if new.name is null then
    raise exception 'Product Type is required before Product Name can be generated.';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_products_auto_name on public.products;
create trigger trg_products_auto_name
before insert or update of product_type, variant_name, material, name
on public.products
for each row
execute function public.apply_product_auto_name();

create or replace function public.create_costa_gear_product_v3(
  p_product_type text,
  p_variant_name text,
  p_material text,
  p_fitments jsonb,
  p_fitment_notes text,
  p_category text,
  p_length_cm numeric,
  p_width_cm numeric,
  p_height_cm numeric,
  p_weight_kg numeric default null,
  p_notes text default null,
  p_market_reference_cad numeric default null,
  p_target_sell_price_cad numeric default null,
  p_target_margin_pct numeric default null,
  p_competitor_reference text default null,
  p_competitor_url text default null,
  p_pricing_notes text default null
)
returns public.products
language plpgsql
set search_path to 'public'
as $function$
declare
  v_row public.products;
  v_type text;
  v_material text;
  v_variant text;
begin
  if not exists(select 1 from public.app_members m where m.user_id=(select auth.uid())) then
    raise exception 'Not authorized.';
  end if;

  select name into v_type
  from public.product_types
  where name=trim(p_product_type) and active=true;
  if v_type is null then raise exception 'Select a valid active Product Type.'; end if;

  v_variant:=nullif(trim(p_variant_name),'');
  v_material:=nullif(trim(p_material),'');
  if v_material is not null and not exists(
    select 1 from public.product_materials where name=v_material and active=true
  ) then
    raise exception 'Select a valid active Material or add the material first.';
  end if;

  if p_length_cm is null or p_length_cm<=0
     or p_width_cm is null or p_width_cm<=0
     or p_height_cm is null or p_height_cm<=0 then
    raise exception 'Length, Width and Height are required and must be greater than zero.';
  end if;

  if coalesce(jsonb_typeof(p_fitments),'')<>'array' or jsonb_array_length(p_fitments)=0 then
    raise exception 'Select at least one vehicle fitment.';
  end if;

  insert into public.products(
    sku_id,product_type,variant_name,material,fitment,name,category,
    length_cm,width_cm,height_cm,weight_kg,notes,
    market_reference_cad,target_sell_price_cad,target_margin_pct,
    competitor_reference,competitor_url,pricing_notes,fitment_notes
  ) values (
    null,v_type,v_variant,v_material,null,
    public.build_costa_gear_product_name(v_type,v_variant,v_material),
    nullif(trim(p_category),''),
    p_length_cm,p_width_cm,p_height_cm,p_weight_kg,nullif(trim(p_notes),''),
    p_market_reference_cad,p_target_sell_price_cad,p_target_margin_pct,
    nullif(trim(p_competitor_reference),''),
    nullif(trim(p_competitor_url),''),
    nullif(trim(p_pricing_notes),''),
    nullif(trim(p_fitment_notes),'')
  ) returning * into v_row;

  perform public.set_product_fitments(v_row.id,p_fitments,p_fitment_notes);

  select * into v_row from public.products where id=v_row.id;
  return v_row;
end;
$function$;

create or replace function public.update_costa_gear_product_v3(
  p_product_id uuid,
  p_product_type text,
  p_variant_name text,
  p_material text,
  p_fitments jsonb,
  p_fitment_notes text,
  p_category text,
  p_length_cm numeric,
  p_width_cm numeric,
  p_height_cm numeric,
  p_weight_kg numeric default null,
  p_notes text default null,
  p_market_reference_cad numeric default null,
  p_target_sell_price_cad numeric default null,
  p_target_margin_pct numeric default null,
  p_competitor_reference text default null,
  p_competitor_url text default null,
  p_pricing_notes text default null
)
returns public.products
language plpgsql
set search_path to 'public'
as $function$
declare
  v_row public.products;
  v_type text;
  v_material text;
  v_variant text;
begin
  if not exists(select 1 from public.app_members m where m.user_id=(select auth.uid())) then
    raise exception 'Not authorized.';
  end if;

  select name into v_type
  from public.product_types
  where name=trim(p_product_type) and active=true;
  if v_type is null then raise exception 'Select a valid active Product Type.'; end if;

  v_variant:=nullif(trim(p_variant_name),'');
  v_material:=nullif(trim(p_material),'');
  if v_material is not null and not exists(
    select 1 from public.product_materials where name=v_material and active=true
  ) then
    raise exception 'Select a valid active Material or add the material first.';
  end if;

  if p_length_cm is null or p_length_cm<=0
     or p_width_cm is null or p_width_cm<=0
     or p_height_cm is null or p_height_cm<=0 then
    raise exception 'Length, Width and Height are required and must be greater than zero.';
  end if;

  update public.products
  set product_type=v_type,
      variant_name=v_variant,
      material=v_material,
      category=nullif(trim(p_category),''),
      length_cm=p_length_cm,
      width_cm=p_width_cm,
      height_cm=p_height_cm,
      weight_kg=p_weight_kg,
      notes=nullif(trim(p_notes),''),
      market_reference_cad=p_market_reference_cad,
      target_sell_price_cad=p_target_sell_price_cad,
      target_margin_pct=p_target_margin_pct,
      competitor_reference=nullif(trim(p_competitor_reference),''),
      competitor_url=nullif(trim(p_competitor_url),''),
      pricing_notes=nullif(trim(p_pricing_notes),'')
  where id=p_product_id
  returning * into v_row;

  if not found then raise exception 'Product not found.'; end if;

  perform public.set_product_fitments(p_product_id,p_fitments,p_fitment_notes);

  select * into v_row from public.products where id=p_product_id;
  return v_row;
end;
$function$;

create or replace function public.create_product_from_quotation_line_v3(
  p_line_id uuid,
  p_product_type text,
  p_variant_name text,
  p_category text,
  p_material text,
  p_fitments jsonb,
  p_fitment_notes text,
  p_length_cm numeric,
  p_width_cm numeric,
  p_height_cm numeric,
  p_weight_kg numeric default null,
  p_notes text default null
)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  v_line public.supplier_quotation_lines;
  v_quotation public.supplier_quotations;
  v_product public.products;
  v_existing_mapping uuid;
  v_source_note text;
begin
  if not exists(select 1 from public.app_members m where m.user_id=(select auth.uid())) then
    raise exception 'Not authorized for Costa Gear operations.';
  end if;

  select * into v_line
  from public.supplier_quotation_lines
  where id=p_line_id
  for update;
  if not found then raise exception 'Quotation line not found.'; end if;

  select * into v_quotation
  from public.supplier_quotations
  where id=v_line.quotation_id
  for update;
  if not found then raise exception 'Supplier quotation not found.'; end if;

  if v_quotation.status<>'Imported' then
    raise exception 'New products can only be created while the quotation is in Imported status.';
  end if;

  if v_line.product_id is not null and v_line.match_status='MATCHED' then
    raise exception 'This quotation line is already matched to a Costa Gear product.';
  end if;

  if nullif(trim(v_line.supplier_sku),'') is not null then
    select m.product_id into v_existing_mapping
    from public.supplier_product_mappings m
    where m.supplier_id=v_quotation.supplier_id
      and m.supplier_sku=v_line.supplier_sku
    limit 1;
    if v_existing_mapping is not null then
      raise exception 'This Supplier SKU is already mapped to an existing Costa Gear product. Refresh the quotation and use the existing match.';
    end if;
  end if;

  v_source_note:='Created from supplier quotation '||v_quotation.quote_ref||
    coalesce(' | Supplier SKU '||nullif(trim(v_line.supplier_sku),''),'');

  v_product:=public.create_costa_gear_product_v3(
    p_product_type,
    p_variant_name,
    p_material,
    p_fitments,
    p_fitment_notes,
    p_category,
    p_length_cm,p_width_cm,p_height_cm,p_weight_kg,
    concat_ws(E'\n',nullif(trim(p_notes),''),v_source_note),
    null,null,null,null,null,null
  );

  if nullif(trim(v_line.supplier_sku),'') is not null then
    insert into public.supplier_product_mappings(supplier_id,supplier_sku,product_id)
    values(v_quotation.supplier_id,v_line.supplier_sku,v_product.id)
    on conflict(supplier_id,supplier_sku) do update
      set product_id=excluded.product_id,updated_at=now();
  end if;

  update public.supplier_quotation_lines
  set product_id=v_product.id,
      match_status='MATCHED'
  where id=p_line_id
  returning * into v_line;

  return jsonb_build_object('product',to_jsonb(v_product),'line',to_jsonb(v_line));
end;
$function$;

revoke all on function public.create_costa_gear_product_v3(text,text,text,jsonb,text,text,numeric,numeric,numeric,numeric,text,numeric,numeric,numeric,text,text,text) from public, anon;
grant execute on function public.create_costa_gear_product_v3(text,text,text,jsonb,text,text,numeric,numeric,numeric,numeric,text,numeric,numeric,numeric,text,text,text) to authenticated;

revoke all on function public.update_costa_gear_product_v3(uuid,text,text,text,jsonb,text,text,numeric,numeric,numeric,numeric,text,numeric,numeric,numeric,text,text,text) from public, anon;
grant execute on function public.update_costa_gear_product_v3(uuid,text,text,text,jsonb,text,text,numeric,numeric,numeric,numeric,text,numeric,numeric,numeric,text,text,text) to authenticated;

revoke all on function public.create_product_from_quotation_line_v3(uuid,text,text,text,text,jsonb,text,numeric,numeric,numeric,numeric,text) from public, anon;
grant execute on function public.create_product_from_quotation_line_v3(uuid,text,text,text,text,jsonb,text,numeric,numeric,numeric,numeric,text) to authenticated;
