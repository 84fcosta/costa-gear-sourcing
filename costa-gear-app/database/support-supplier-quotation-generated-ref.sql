-- Support supplier quotations that do not carry a supplier-issued reference.
-- Applied to production via Supabase migration: support_supplier_quotations_without_source_ref

alter table public.supplier_quotations
  add column if not exists supplier_quote_ref text;

update public.supplier_quotations
set supplier_quote_ref = quote_ref
where supplier_quote_ref is null
  and nullif(trim(quote_ref), '') is not null
  and quote_ref not like 'CGQ-%';

create unique index if not exists supplier_quotations_supplier_source_ref_uk
  on public.supplier_quotations (supplier_id, supplier_quote_ref)
  where supplier_quote_ref is not null;

CREATE OR REPLACE FUNCTION public.import_supplier_quotation(p_supplier_id uuid, p_header jsonb, p_lines jsonb)
 RETURNS supplier_quotations
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
  v_supplier_quote_ref text;
  v_quote_ref text;
  v_supplier_code text;
  v_ref_date date;
  v_ref_base text;
  v_seq integer := 1;
begin
  if not exists (select 1 from public.app_members m where m.user_id = auth.uid()) then
    raise exception 'Not authorized for Costa Gear operations.';
  end if;

  if not exists (select 1 from public.suppliers s where s.id = p_supplier_id) then
    raise exception 'Select a valid supplier before importing.';
  end if;

  if coalesce(jsonb_typeof(p_lines), '') <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'The Items sheet contains no importable rows.';
  end if;

  v_supplier_quote_ref := nullif(trim(p_header->>'quoteRef'), '');

  if v_supplier_quote_ref is not null then
    if exists (
      select 1
      from public.supplier_quotations sq
      where sq.supplier_id = p_supplier_id
        and (
          sq.supplier_quote_ref = v_supplier_quote_ref
          or (sq.supplier_quote_ref is null and sq.quote_ref = v_supplier_quote_ref)
        )
    ) then
      raise exception 'This supplier quotation has already been imported.';
    end if;

    v_quote_ref := v_supplier_quote_ref;
  else
    select regexp_replace(coalesce(s.sup_id, 'SUP'), '[^A-Za-z0-9]', '', 'g')
      into v_supplier_code
    from public.suppliers s
    where s.id = p_supplier_id;

    v_ref_date := coalesce(nullif(p_header->>'quoteDate', '')::date, current_date);
    v_ref_base := 'CGQ-' || upper(coalesce(nullif(v_supplier_code, ''), 'SUP')) || '-' || to_char(v_ref_date, 'YYYYMMDD');

    perform pg_advisory_xact_lock(hashtext(p_supplier_id::text || ':' || v_ref_base));

    loop
      v_quote_ref := v_ref_base || '-' || lpad(v_seq::text, 2, '0');
      exit when not exists (
        select 1
        from public.supplier_quotations sq
        where sq.supplier_id = p_supplier_id
          and sq.quote_ref = v_quote_ref
      );
      v_seq := v_seq + 1;
    end loop;
  end if;

  insert into public.supplier_quotations(
    supplier_id, quote_ref, supplier_quote_ref, quote_date, currency, incoterm, shipping_method,
    shipping_total, shipping_currency, product_subtotal, grand_total, transit_time_days,
    dispatch_lead_time_days, packaging, payment_terms, notes, validation_status, status
  ) values (
    p_supplier_id,
    v_quote_ref,
    v_supplier_quote_ref,
    nullif(p_header->>'quoteDate', '')::date,
    coalesce(nullif(trim(p_header->>'currency'), ''), 'USD'),
    nullif(trim(p_header->>'incoterm'), ''),
    nullif(trim(p_header->>'shippingMethod'), ''),
    nullif(p_header->>'shippingTotal', '')::numeric,
    coalesce(nullif(trim(p_header->>'shippingCurrency'), ''), 'USD'),
    nullif(p_header->>'productSubtotal', '')::numeric,
    nullif(p_header->>'grandTotal', '')::numeric,
    nullif(p_header->>'transitTimeDays', '')::integer,
    nullif(p_header->>'dispatchLeadTimeDays', '')::integer,
    nullif(trim(p_header->>'packaging'), ''),
    nullif(trim(p_header->>'paymentTerms'), ''),
    nullif(trim(p_header->>'notes'), ''),
    'NOT CHECKED',
    'Imported'
  ) returning * into v_q;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_line_no := nullif(v_line->>'line', '')::integer;
    if v_line_no is null then
      raise exception 'Every Items row requires a Line number.';
    end if;

    v_qty := nullif(v_line->>'quantity', '')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Line % has an invalid quantity.', v_line_no;
    end if;

    v_unit_price := nullif(v_line->>'unitPrice', '')::numeric;
    if v_unit_price is null or v_unit_price < 0 then
      raise exception 'Line % has an invalid Unit Price.', v_line_no;
    end if;

    v_supplier_total := nullif(v_line->>'supplierLineTotal', '')::numeric;
    v_calc_total := round(v_qty * v_unit_price, 4);

    if v_supplier_total is null then
      v_line_validation := 'NOT CHECKED';
      v_sum := v_sum + v_calc_total;
    else
      v_has_totals := true;
      v_line_validation := case
        when abs(v_supplier_total - v_calc_total) < 0.01 then 'PASS'
        else 'REVIEW REQUIRED'
      end;
      v_sum := v_sum + v_supplier_total;
    end if;

    v_supplier_sku := nullif(trim(v_line->>'supplierSku'), '');
    v_cg_sku := nullif(trim(v_line->>'cgSku'), '');
    v_product_id := null;

    if v_cg_sku is not null then
      select p.id
        into v_product_id
      from public.products p
      where lower(trim(p.sku_id)) = lower(v_cg_sku)
      limit 1;
    end if;

    if v_product_id is null and v_supplier_sku is not null then
      select m.product_id
        into v_product_id
      from public.supplier_product_mappings m
      where m.supplier_id = p_supplier_id
        and m.supplier_sku = v_supplier_sku
      limit 1;
    end if;

    if v_product_id is null and v_supplier_sku is not null then
      select min(q.product_id::text)::uuid
        into v_product_id
      from public.quotes q
      where q.supplier_id = p_supplier_id
        and q.supplier_sku = v_supplier_sku
        and q.product_id is not null
      having count(distinct q.product_id) = 1;
    end if;

    if v_product_id is not null and v_supplier_sku is not null then
      insert into public.supplier_product_mappings(supplier_id, supplier_sku, product_id)
      values(p_supplier_id, v_supplier_sku, v_product_id)
      on conflict(supplier_id, supplier_sku)
      do update set product_id = excluded.product_id, updated_at = now();
    end if;

    insert into public.supplier_quotation_lines(
      quotation_id, line_no, supplier_sku, supplier_description, unit, quantity, unit_price,
      supplier_line_total, calculated_line_total, line_validation, original_notes,
      source_cg_sku, product_id, match_status
    ) values (
      v_q.id,
      v_line_no,
      v_supplier_sku,
      nullif(trim(v_line->>'description'), ''),
      nullif(trim(v_line->>'unit'), ''),
      v_qty,
      v_unit_price,
      v_supplier_total,
      v_calc_total,
      v_line_validation,
      nullif(trim(v_line->>'notes'), ''),
      v_cg_sku,
      v_product_id,
      case when v_product_id is not null then 'MATCHED' else 'UNMATCHED' end
    );
  end loop;

  if exists (
    select 1
    from public.supplier_quotation_lines l
    where l.quotation_id = v_q.id
      and l.line_validation = 'REVIEW REQUIRED'
  ) then
    v_header_validation := 'REVIEW REQUIRED';
  elsif v_q.product_subtotal is not null and abs(v_q.product_subtotal - v_sum) >= 0.01 then
    v_header_validation := 'REVIEW REQUIRED';
  elsif v_q.grand_total is not null
        and v_q.product_subtotal is not null
        and v_q.shipping_total is not null
        and abs(v_q.grand_total - (v_q.product_subtotal + v_q.shipping_total)) >= 0.01 then
    v_header_validation := 'REVIEW REQUIRED';
  elsif v_q.product_subtotal is not null and (v_has_totals or v_sum > 0) then
    v_header_validation := 'PASS';
  else
    v_header_validation := 'NOT CHECKED';
  end if;

  update public.supplier_quotations
  set validation_status = v_header_validation
  where id = v_q.id
  returning * into v_q;

  return v_q;
end;
$function$;
