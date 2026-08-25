create or replace function public.create_product_from_quotation_line(
  p_line_id uuid,
  p_name text default null,
  p_product_type text default null,
  p_category text default null,
  p_material text default null,
  p_fitment text default null,
  p_notes text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_line public.supplier_quotation_lines;
  v_quotation public.supplier_quotations;
  v_product public.products;
  v_existing_mapping uuid;
  v_next integer;
  v_sku text;
  v_name text;
  v_source_note text;
begin
  if not exists (select 1 from public.app_members m where m.user_id = auth.uid()) then
    raise exception 'Not authorized for Costa Gear operations.';
  end if;

  select * into v_line
  from public.supplier_quotation_lines
  where id = p_line_id
  for update;
  if not found then raise exception 'Quotation line not found.'; end if;

  select * into v_quotation
  from public.supplier_quotations
  where id = v_line.quotation_id
  for update;
  if not found then raise exception 'Supplier quotation not found.'; end if;
  if v_quotation.status <> 'Imported' then
    raise exception 'New products can only be created while the quotation is in Imported status.';
  end if;
  if v_line.product_id is not null then
    raise exception 'This quotation line is already matched to a Costa Gear product.';
  end if;

  if nullif(trim(v_line.supplier_sku), '') is not null then
    select m.product_id into v_existing_mapping
    from public.supplier_product_mappings m
    where m.supplier_id = v_quotation.supplier_id
      and m.supplier_sku = v_line.supplier_sku
    limit 1;
    if v_existing_mapping is not null then
      raise exception 'This Supplier SKU is already mapped to an existing Costa Gear product. Refresh the quotation and use the existing match.';
    end if;
  end if;

  v_name := coalesce(nullif(trim(p_name), ''), nullif(trim(v_line.supplier_description), ''), nullif(trim(v_line.supplier_sku), ''));
  if v_name is null then
    raise exception 'Enter a product name before creating the Costa Gear product.';
  end if;

  perform pg_advisory_xact_lock(hashtext('costa_gear_product_sku_sequence'));
  select coalesce(max((substring(p.sku_id from '^CG-([0-9]+)$'))::integer), 0) + 1
    into v_next
  from public.products p
  where p.sku_id ~ '^CG-[0-9]+$';
  v_sku := 'CG-' || to_char(v_next, 'FM000');

  v_source_note := 'Created from supplier quotation ' || v_quotation.quote_ref ||
                   coalesce(' | Supplier SKU ' || nullif(trim(v_line.supplier_sku), ''), '');

  insert into public.products(
    sku_id, name, product_type, category, material, fitment, notes
  ) values (
    v_sku,
    v_name,
    nullif(trim(p_product_type), ''),
    nullif(trim(p_category), ''),
    nullif(trim(p_material), ''),
    nullif(trim(p_fitment), ''),
    concat_ws(E'\n', nullif(trim(p_notes), ''), v_source_note)
  ) returning * into v_product;

  if nullif(trim(v_line.supplier_sku), '') is not null then
    insert into public.supplier_product_mappings(supplier_id, supplier_sku, product_id)
    values(v_quotation.supplier_id, v_line.supplier_sku, v_product.id)
    on conflict(supplier_id, supplier_sku) do update
      set product_id = excluded.product_id, updated_at = now();
  end if;

  update public.supplier_quotation_lines
     set product_id = v_product.id,
         match_status = 'MATCHED'
   where id = p_line_id
   returning * into v_line;

  return jsonb_build_object('product', to_jsonb(v_product), 'line', to_jsonb(v_line));
end;
$$;

revoke all on function public.create_product_from_quotation_line(uuid,text,text,text,text,text,text) from public;
revoke all on function public.create_product_from_quotation_line(uuid,text,text,text,text,text,text) from anon;
grant execute on function public.create_product_from_quotation_line(uuid,text,text,text,text,text,text) to authenticated;
