create or replace function public.delete_unused_product_type(p_id uuid)
returns public.product_types
language plpgsql
set search_path to 'public'
as $function$
declare
  v_row public.product_types;
  v_usage integer;
begin
  if not exists (
    select 1
    from public.app_members m
    where m.user_id = (select auth.uid())
  ) then
    raise exception 'Not authorized.';
  end if;

  select *
    into v_row
  from public.product_types
  where id = p_id
  for update;

  if not found then
    raise exception 'Product Type not found.';
  end if;

  select count(*)
    into v_usage
  from public.products
  where product_type = v_row.name;

  if v_usage > 0 then
    raise exception 'This Product Type is used by % product(s). Reassign those products before deleting it.', v_usage;
  end if;

  delete from public.product_types
  where id = p_id;

  return v_row;
end;
$function$;

revoke all on function public.delete_unused_product_type(uuid) from public, anon;
grant execute on function public.delete_unused_product_type(uuid) to authenticated;
