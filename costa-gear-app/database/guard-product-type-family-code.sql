-- Prevent future Product Type family-code collisions without rewriting legacy taxonomy.
-- Existing historical duplicates remain valid until deliberately consolidated.

create or replace function public.guard_product_type_family_code()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_conflict public.product_types;
begin
  new.family_code := upper(regexp_replace(coalesce(trim(new.family_code),''),'[^A-Za-z0-9]','','g'));

  if length(new.family_code) < 2 or length(new.family_code) > 4 then
    raise exception 'Family Code must contain 2 to 4 letters or numbers.';
  end if;

  if tg_op = 'UPDATE' and new.family_code is not distinct from old.family_code then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    select *
      into v_conflict
    from public.product_types t
    where t.id <> new.id
      and upper(trim(t.family_code)) = new.family_code
    order by t.active desc, t.created_at asc
    limit 1;
  else
    select *
      into v_conflict
    from public.product_types t
    where upper(trim(t.family_code)) = new.family_code
    order by t.active desc, t.created_at asc
    limit 1;
  end if;

  if found then
    raise exception 'Family Code % is already assigned to Product Type "%". Choose a different Family Code.',
      new.family_code, v_conflict.name;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_product_types_guard_family_code on public.product_types;
create trigger trg_product_types_guard_family_code
before insert or update of family_code
on public.product_types
for each row
execute function public.guard_product_type_family_code();

create or replace function public.add_product_type(p_name text, p_family_code text)
returns public.product_types
language plpgsql
set search_path to 'public'
as $function$
declare
  v_name text;
  v_code text;
  v_row public.product_types;
  v_conflict public.product_types;
begin
  if not exists (
    select 1 from public.app_members m where m.user_id = (select auth.uid())
  ) then
    raise exception 'Not authorized.';
  end if;

  v_name := nullif(trim(p_name),'');
  if v_name is null then
    raise exception 'Product Type name is required.';
  end if;

  v_code := upper(regexp_replace(coalesce(trim(p_family_code),''),'[^A-Za-z0-9]','','g'));
  if length(v_code) < 2 or length(v_code) > 4 then
    raise exception 'Family Code must contain 2 to 4 letters or numbers.';
  end if;

  select * into v_row
  from public.product_types
  where lower(name)=lower(v_name)
  limit 1;

  if found then
    if v_row.family_code <> v_code then
      raise exception 'This Product Type already exists with family code %.', v_row.family_code;
    end if;
    if not v_row.active then
      update public.product_types
      set active=true, updated_at=now()
      where id=v_row.id
      returning * into v_row;
    end if;
    return v_row;
  end if;

  select *
    into v_conflict
  from public.product_types
  where upper(trim(family_code)) = v_code
  order by active desc, created_at asc
  limit 1;

  if found then
    raise exception 'Family Code % is already assigned to Product Type "%". Choose a different Family Code.',
      v_code, v_conflict.name;
  end if;

  insert into public.product_types(name,family_code)
  values(v_name,v_code)
  returning * into v_row;

  return v_row;
end;
$function$;

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
  v_conflict public.product_types;
begin
  if not exists(select 1 from public.app_members m where m.user_id=(select auth.uid())) then
    raise exception 'Not authorized.';
  end if;

  select * into v_old from public.product_types where id=p_id for update;
  if not found then raise exception 'Product Type not found.'; end if;

  v_name:=nullif(trim(p_name),'');
  v_family:=upper(regexp_replace(coalesce(trim(p_family_code),''),'[^A-Za-z0-9]','','g'));
  if v_name is null then raise exception 'Product Type name is required.'; end if;
  if length(v_family) < 2 or length(v_family) > 4 then
    raise exception 'Family Code must contain 2 to 4 letters or numbers.';
  end if;

  if exists(select 1 from public.product_types t where t.id<>p_id and lower(t.name)=lower(v_name)) then
    raise exception 'A Product Type with this name already exists.';
  end if;

  if v_family <> v_old.family_code then
    select *
      into v_conflict
    from public.product_types t
    where t.id <> p_id
      and upper(trim(t.family_code)) = v_family
    order by t.active desc, t.created_at asc
    limit 1;

    if found then
      raise exception 'Family Code % is already assigned to Product Type "%". Choose a different Family Code.',
        v_family, v_conflict.name;
    end if;
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

-- Controlled correction of the accidental Door Hinge Step DS assignment.
do $repair$
declare
  v_type public.product_types;
  v_product public.products;
begin
  select *
    into v_type
  from public.product_types
  where lower(name)=lower('Door Hinge Step')
  limit 1;

  if not found then
    raise exception 'Door Hinge Step Product Type was not found; repair aborted.';
  end if;

  if v_type.family_code not in ('DS','HS') then
    raise exception 'Door Hinge Step has unexpected family code %; repair aborted.', v_type.family_code;
  end if;

  if exists (
    select 1
    from public.product_types t
    where t.id <> v_type.id
      and upper(trim(t.family_code))='HS'
  ) then
    raise exception 'HS is already assigned to another Product Type; repair aborted.';
  end if;

  select *
    into v_product
  from public.products
  where product_type='Door Hinge Step'
  order by created_at
  limit 1;

  if not found then
    raise exception 'Door Hinge Step product was not found; repair aborted.';
  end if;

  if (select count(*) from public.products where product_type='Door Hinge Step') <> 1 then
    raise exception 'Expected exactly one Door Hinge Step product; repair aborted.';
  end if;

  if v_product.sku_id not in ('CG-DS-03','CG-HS-01') then
    raise exception 'Door Hinge Step has unexpected SKU %; repair aborted.', v_product.sku_id;
  end if;

  if exists (
    select 1
    from public.products p
    where p.id <> v_product.id
      and p.sku_id='CG-HS-01'
  ) then
    raise exception 'CG-HS-01 is already assigned to another product; repair aborted.';
  end if;

  update public.product_types
  set family_code='HS',
      updated_at=now()
  where id=v_type.id
    and family_code<>'HS';

  update public.products
  set sku_id='CG-HS-01'
  where id=v_product.id
    and sku_id<>'CG-HS-01';
end;
$repair$;

revoke all on function public.add_product_type(text,text) from public, anon;
grant execute on function public.add_product_type(text,text) to authenticated;

revoke all on function public.update_product_type_master(uuid,text,text,boolean) from public, anon;
grant execute on function public.update_product_type_master(uuid,text,text,boolean) to authenticated;
