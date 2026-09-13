create or replace function public.update_product_type_master(
  p_id uuid,
  p_name text,
  p_family_code text,
  p_active boolean default true
)
returns public.product_types
language plpgsql
set search_path to 'public'
as $function$
declare
  v_old public.product_types;
  v_row public.product_types;
  v_name text;
  v_family text;
  v_usage integer;
begin
  if not exists(select 1 from public.app_members m where m.user_id=(select auth.uid())) then
    raise exception 'Not authorized.';
  end if;

  select * into v_old from public.product_types where id=p_id for update;
  if not found then raise exception 'Product Type not found.'; end if;

  v_name:=nullif(trim(p_name),'');
  v_family:=upper(nullif(trim(p_family_code),''));
  if v_name is null then raise exception 'Product Type name is required.'; end if;
  if v_family is null or v_family !~ '^[A-Z0-9]{2,4}$' then
    raise exception 'Family Code must contain 2 to 4 letters or numbers.';
  end if;

  if exists(select 1 from public.product_types t where t.id<>p_id and lower(t.name)=lower(v_name)) then
    raise exception 'A Product Type with this name already exists.';
  end if;

  select count(*) into v_usage from public.products where product_type=v_old.name;

  if v_usage>0 and v_family<>v_old.family_code then
    raise exception 'Family Code cannot be changed while this Product Type is used by % product(s). Existing SKU families are permanent.',v_usage;
  end if;

  if v_usage>0 and coalesce(p_active,true)=false then
    raise exception 'This Product Type is used by % product(s). Reassign those products before deactivating it.',v_usage;
  end if;

  update public.product_types
  set name=v_name,
      family_code=v_family,
      active=coalesce(p_active,true),
      updated_at=now()
  where id=p_id
  returning * into v_row;

  if v_name<>v_old.name then
    update public.products
    set product_type=v_name
    where product_type=v_old.name;
  end if;

  return v_row;
end;
$function$;

create or replace function public.update_product_material_master(
  p_id uuid,
  p_name text,
  p_active boolean default true
)
returns public.product_materials
language plpgsql
set search_path to 'public'
as $function$
declare
  v_old public.product_materials;
  v_row public.product_materials;
  v_name text;
  v_usage integer;
begin
  if not exists(select 1 from public.app_members m where m.user_id=(select auth.uid())) then
    raise exception 'Not authorized.';
  end if;

  select * into v_old from public.product_materials where id=p_id for update;
  if not found then raise exception 'Material not found.'; end if;

  v_name:=nullif(trim(p_name),'');
  if v_name is null then raise exception 'Material name is required.'; end if;

  if exists(select 1 from public.product_materials m where m.id<>p_id and lower(m.name)=lower(v_name)) then
    raise exception 'A Material with this name already exists.';
  end if;

  select count(*) into v_usage from public.products where material=v_old.name;

  if v_usage>0 and coalesce(p_active,true)=false then
    raise exception 'This Material is used by % product(s). Reassign those products before deactivating it.',v_usage;
  end if;

  update public.product_materials
  set name=v_name,
      active=coalesce(p_active,true),
      updated_at=now()
  where id=p_id
  returning * into v_row;

  if v_name<>v_old.name then
    update public.products
    set material=v_name
    where material=v_old.name;
  end if;

  return v_row;
end;
$function$;

create or replace function public.update_product_category_master(
  p_id uuid,
  p_name text,
  p_active boolean default true
)
returns public.product_categories
language plpgsql
set search_path to 'public'
as $function$
declare
  v_old public.product_categories;
  v_row public.product_categories;
  v_name text;
  v_usage integer;
begin
  if not exists(select 1 from public.app_members m where m.user_id=(select auth.uid())) then
    raise exception 'Not authorized.';
  end if;

  select * into v_old from public.product_categories where id=p_id for update;
  if not found then raise exception 'Category not found.'; end if;

  v_name:=nullif(trim(p_name),'');
  if v_name is null then raise exception 'Category name is required.'; end if;

  if exists(select 1 from public.product_categories c where c.id<>p_id and lower(c.name)=lower(v_name)) then
    raise exception 'A Category with this name already exists.';
  end if;

  select count(*) into v_usage from public.products where category=v_old.name;

  if v_usage>0 and coalesce(p_active,true)=false then
    raise exception 'This Category is used by % product(s). Reassign those products before deactivating it.',v_usage;
  end if;

  update public.product_categories
  set name=v_name,
      active=coalesce(p_active,true),
      updated_at=now()
  where id=p_id
  returning * into v_row;

  if v_name<>v_old.name then
    update public.products
    set category=v_name
    where category=v_old.name;
  end if;

  return v_row;
end;
$function$;

revoke all on function public.update_product_type_master(uuid,text,text,boolean) from public, anon;
grant execute on function public.update_product_type_master(uuid,text,text,boolean) to authenticated;

revoke all on function public.update_product_material_master(uuid,text,boolean) from public, anon;
grant execute on function public.update_product_material_master(uuid,text,boolean) to authenticated;

revoke all on function public.update_product_category_master(uuid,text,boolean) from public, anon;
grant execute on function public.update_product_category_master(uuid,text,boolean) to authenticated;
