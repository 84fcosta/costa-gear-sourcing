create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists product_categories_name_ci_uk
  on public.product_categories (lower(name));

alter table public.product_categories enable row level security;

drop policy if exists "app members read product categories" on public.product_categories;
create policy "app members read product categories"
on public.product_categories
for select
to authenticated
using (exists (
  select 1 from public.app_members m where m.user_id = (select auth.uid())
));

drop policy if exists "app members insert product categories" on public.product_categories;
create policy "app members insert product categories"
on public.product_categories
for insert
to authenticated
with check (exists (
  select 1 from public.app_members m where m.user_id = (select auth.uid())
));

drop policy if exists "app members update product categories" on public.product_categories;
create policy "app members update product categories"
on public.product_categories
for update
to authenticated
using (exists (
  select 1 from public.app_members m where m.user_id = (select auth.uid())
))
with check (exists (
  select 1 from public.app_members m where m.user_id = (select auth.uid())
));

revoke all on table public.product_categories from anon;
grant select, insert, update on table public.product_categories to authenticated;

insert into public.product_categories(name,sort_order) values
  ('Exterior – Protection',10),
  ('Exterior – Lighting',20),
  ('Exterior – Storage & Cargo',30),
  ('Exterior – Access & Entry',40),
  ('Exterior – Recovery',50),
  ('Interior – Storage',60),
  ('Interior – Mounting & Tech',70),
  ('Interior – Comfort & Utility',80),
  ('Interior – Protection',90),
  ('Drivetrain & Suspension',100),
  ('Other',999)
on conflict do nothing;

update public.products
set category = case category
  when 'Exterior - Protection' then 'Exterior – Protection'
  when 'Exterior - Lighting' then 'Exterior – Lighting'
  when 'Exterior - Storage & Cargo' then 'Exterior – Storage & Cargo'
  when 'Exterior - Access & Entry' then 'Exterior – Access & Entry'
  when 'Exterior - Recovery' then 'Exterior – Recovery'
  when 'Interior - Storage' then 'Interior – Storage'
  when 'Interior - Mounting & Tech' then 'Interior – Mounting & Tech'
  when 'Interior - Comfort & Utility' then 'Interior – Comfort & Utility'
  when 'Interior - Protection' then 'Interior – Protection'
  else category
end
where category is not null;

update public.products
set category='Exterior – Protection', updated_at=now()
where product_type='Door Sill Entry Guard';

update public.products
set category='Interior – Protection', updated_at=now()
where product_type='Floor Mat Set';

create or replace function public.validate_product_category()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  new.category := nullif(trim(new.category),'');
  if new.category is null then
    raise exception 'Select a Product Category.';
  end if;

  if not exists (
    select 1
    from public.product_categories c
    where c.name = new.category
      and c.active = true
  ) then
    raise exception 'Select a valid active Product Category or add the category first.';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_validate_product_category on public.products;
create trigger trg_validate_product_category
before insert or update of category
on public.products
for each row
execute function public.validate_product_category();

alter table public.products
  alter column category set not null;

drop policy if exists "app members insert product types" on public.product_types;
create policy "app members insert product types"
on public.product_types
for insert
to authenticated
with check (exists (
  select 1 from public.app_members m where m.user_id = (select auth.uid())
));

drop policy if exists "app members update product types" on public.product_types;
create policy "app members update product types"
on public.product_types
for update
to authenticated
using (exists (
  select 1 from public.app_members m where m.user_id = (select auth.uid())
))
with check (exists (
  select 1 from public.app_members m where m.user_id = (select auth.uid())
));

create or replace function public.add_product_category(p_name text)
returns public.product_categories
language plpgsql
set search_path to 'public'
as $function$
declare
  v_name text;
  v_row public.product_categories;
begin
  if not exists (
    select 1 from public.app_members m where m.user_id = (select auth.uid())
  ) then
    raise exception 'Not authorized.';
  end if;

  v_name := nullif(trim(p_name),'');
  if v_name is null then
    raise exception 'Category name is required.';
  end if;

  select * into v_row
  from public.product_categories
  where lower(name)=lower(v_name)
  limit 1;

  if found then
    if not v_row.active then
      update public.product_categories
      set active=true, updated_at=now()
      where id=v_row.id
      returning * into v_row;
    end if;
    return v_row;
  end if;

  insert into public.product_categories(name)
  values(v_name)
  returning * into v_row;

  return v_row;
end;
$function$;

create or replace function public.add_product_type(p_name text, p_family_code text)
returns public.product_types
language plpgsql
set search_path to 'public'
as $function$
declare
  v_name text;
  v_code text;
  v_row public.product_types;
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

  insert into public.product_types(name,family_code)
  values(v_name,v_code)
  returning * into v_row;

  return v_row;
end;
$function$;

revoke all on function public.add_product_category(text) from public, anon;
grant execute on function public.add_product_category(text) to authenticated;

revoke all on function public.add_product_type(text,text) from public, anon;
grant execute on function public.add_product_type(text,text) to authenticated;
