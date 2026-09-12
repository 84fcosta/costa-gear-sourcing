-- Unified Supplier Intake: create suppliers safely from reviewed intake metadata.
create or replace function public.create_supplier_from_intake(
  p_name text,
  p_platform text default null,
  p_contact text default null,
  p_notes text default null
)
returns public.suppliers
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_name text := nullif(trim(p_name), '');
  v_next integer;
  v_sup_id text;
  v_row public.suppliers;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not exists (
    select 1 from public.app_members m where m.user_id = auth.uid()
  ) then
    raise exception 'Costa Gear membership required.';
  end if;

  if v_name is null then
    raise exception 'Supplier name is required.';
  end if;

  perform pg_advisory_xact_lock(hashtext('costa_gear_suppliers_sup_id'));

  select coalesce(max((regexp_match(sup_id, '^SUP-([0-9]+)$'))[1]::integer), 0) + 1
  into v_next
  from public.suppliers
  where sup_id ~ '^SUP-[0-9]+$';

  v_sup_id := 'SUP-' || lpad(v_next::text, 3, '0');

  insert into public.suppliers (
    sup_id,
    name,
    platform,
    contact,
    status,
    notes,
    updated_at
  )
  values (
    v_sup_id,
    v_name,
    nullif(trim(p_platform), ''),
    nullif(trim(p_contact), ''),
    'Active',
    nullif(trim(p_notes), ''),
    now()
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.create_supplier_from_intake(text,text,text,text) from public;
revoke all on function public.create_supplier_from_intake(text,text,text,text) from anon;
grant execute on function public.create_supplier_from_intake(text,text,text,text) to authenticated;
