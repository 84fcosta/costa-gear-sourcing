-- Permanent quotation identity framework.
-- Costa Gear internal quotation IDs are global sequential QUO#### values.
-- Supplier-provided quote numbers remain in supplier_quote_ref.
-- legacy_quote_ref preserves the previous internal/source reference for audit traceability.

create sequence if not exists public.supplier_quotation_number_seq;

alter table public.supplier_quotations
  add column if not exists quote_number integer,
  add column if not exists legacy_quote_ref text;

with ranked as (
  select id, row_number() over (order by created_at, id)::integer as n
  from public.supplier_quotations
)
update public.supplier_quotations q
set quote_number = r.n
from ranked r
where q.id = r.id
  and q.quote_number is null;

update public.supplier_quotations
set legacy_quote_ref = coalesce(legacy_quote_ref, quote_ref)
where legacy_quote_ref is null
  and quote_ref is not null;

-- YZ20260615 is a supplier-provided quotation reference from the legacy import.
-- Generated CGQ-* references are Costa Gear legacy internal IDs and do not belong in supplier_quote_ref.
update public.supplier_quotations
set supplier_quote_ref = legacy_quote_ref
where supplier_quote_ref is null
  and legacy_quote_ref is not null
  and legacy_quote_ref !~ '^CGQ-';

alter sequence public.supplier_quotation_number_seq
  owned by public.supplier_quotations.quote_number;

do $$
declare
  v_max integer;
begin
  select coalesce(max(quote_number), 0) into v_max from public.supplier_quotations;
  if v_max = 0 then
    perform setval('public.supplier_quotation_number_seq', 1, false);
  else
    perform setval('public.supplier_quotation_number_seq', v_max, true);
  end if;
end $$;

alter table public.supplier_quotations
  alter column quote_number set default nextval('public.supplier_quotation_number_seq'),
  alter column quote_number set not null;

create unique index if not exists supplier_quotations_quote_number_uk
  on public.supplier_quotations (quote_number);

create or replace function public.enforce_supplier_quotation_identity()
returns trigger
language plpgsql
set search_path = 'public'
as $$
begin
  if new.quote_number is null then
    new.quote_number := nextval('public.supplier_quotation_number_seq');
  end if;
  new.quote_ref := 'QUO' || lpad(new.quote_number::text, 4, '0');
  return new;
end;
$$;

drop trigger if exists trg_enforce_supplier_quotation_identity on public.supplier_quotations;
create trigger trg_enforce_supplier_quotation_identity
before insert or update of quote_number on public.supplier_quotations
for each row
execute function public.enforce_supplier_quotation_identity();

update public.supplier_quotations
set quote_ref = 'QUO' || lpad(quote_number::text, 4, '0');

create unique index if not exists supplier_quotations_quote_ref_global_uk
  on public.supplier_quotations (quote_ref);

comment on column public.supplier_quotations.quote_number is
  'Costa Gear global sequential quotation number. Filename/display key is QUO plus four digits.';
comment on column public.supplier_quotations.quote_ref is
  'Costa Gear internal quotation reference in QUO#### format.';
comment on column public.supplier_quotations.supplier_quote_ref is
  'Reference supplied by the supplier, when present. Never used as the Costa Gear internal quotation ID.';
comment on column public.supplier_quotations.legacy_quote_ref is
  'Previous quotation reference retained for migration/audit traceability.';

create or replace function public.import_supplier_quotation(p_supplier_id uuid, p_header jsonb, p_lines jsonb)
returns supplier_quotations
language plpgsql
set search_path = 'public'
as $function$
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
  v_dimension_review boolean := false;
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

  if v_supplier_quote_ref is not null and exists (
    select 1
    from public.supplier_quotations sq
    where sq.supplier_id = p_supplier_id
      and sq.supplier_quote_ref = v_supplier_quote_ref
  ) then
    raise exception 'This supplier quotation has already been imported.';
  end if;

  insert into public.supplier_quotations(
    supplier_id, supplier_quote_ref, quote_date, currency, incoterm, shipping_method,
    shipping_total, shipping_currency, product_subtotal, grand_total, transit_time_days,
    dispatch_lead_time_days, packaging, payment_terms, notes, validation_status, status
  ) values (
    p_supplier_id, v_supplier_quote_ref,
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
    'NOT CHECKED','Imported'
  ) returning * into v_q;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_line_no := nullif(v_line->>'line', '')::integer;
    if v_line_no is null then raise exception 'Every Items row requires a Line number.'; end if;

    v_qty := nullif(v_line->>'quantity', '')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'Line % has an invalid quantity.', v_line_no; end if;

    v_unit_price := nullif(v_line->>'unitPrice', '')::numeric;
    if v_unit_price is null or v_unit_price < 0 then raise exception 'Line % has an invalid Unit Price.', v_line_no; end if;

    v_supplier_total := nullif(v_line->>'supplierLineTotal', '')::numeric;
    v_calc_total := round(v_qty * v_unit_price, 4);

    if v_supplier_total is null then
      v_line_validation := 'NOT CHECKED';
      v_sum := v_sum + v_calc_total;
    else
      v_has_totals := true;
      v_line_validation := case when abs(v_supplier_total - v_calc_total) < 0.01 then 'PASS' else 'REVIEW REQUIRED' end;
      v_sum := v_sum + v_supplier_total;
    end if;

    v_supplier_sku := nullif(trim(v_line->>'supplierSku'), '');
    v_cg_sku := nullif(trim(v_line->>'cgSku'), '');
    v_product_id := null;
    v_dimension_review := false;

    if v_cg_sku is not null then
      select p.id into v_product_id
      from public.products p
      where lower(trim(p.sku_id)) = lower(v_cg_sku)
      limit 1;
    end if;

    if v_product_id is null and v_supplier_sku is not null then
      select m.product_id into v_product_id
      from public.supplier_product_mappings m
      where m.supplier_id = p_supplier_id and m.supplier_sku = v_supplier_sku
      limit 1;
    end if;

    if v_product_id is null and v_supplier_sku is not null then
      select min(q.product_id::text)::uuid into v_product_id
      from public.quotes q
      where q.supplier_id = p_supplier_id
        and q.supplier_sku = v_supplier_sku
        and q.product_id is not null
      having count(distinct q.product_id) = 1;
    end if;

    if v_product_id is not null then
      v_dimension_review := public.supplier_product_dimension_mismatch(v_line->>'description',v_product_id);
    end if;

    if v_product_id is not null and v_supplier_sku is not null and not v_dimension_review then
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
      v_q.id,v_line_no,v_supplier_sku,
      nullif(trim(v_line->>'description'), ''),
      nullif(trim(v_line->>'unit'), ''),
      v_qty,v_unit_price,v_supplier_total,v_calc_total,v_line_validation,
      nullif(trim(v_line->>'notes'), ''),
      v_cg_sku,v_product_id,
      case
        when v_product_id is null then 'UNMATCHED'
        when v_dimension_review then 'REVIEW'
        else 'MATCHED'
      end
    );
  end loop;

  if exists (
    select 1 from public.supplier_quotation_lines l
    where l.quotation_id = v_q.id and l.line_validation = 'REVIEW REQUIRED'
  ) then
    v_header_validation := 'REVIEW REQUIRED';
  elsif v_q.product_subtotal is not null and abs(v_q.product_subtotal - v_sum) >= 0.01 then
    v_header_validation := 'REVIEW REQUIRED';
  elsif v_q.grand_total is not null and v_q.product_subtotal is not null and v_q.shipping_total is not null
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

-- Rewrite historical human-readable notes to the new internal quotation IDs.
do $$
declare
  r record;
begin
  for r in
    select legacy_quote_ref, quote_ref
    from public.supplier_quotations
    where legacy_quote_ref is not null
      and legacy_quote_ref <> quote_ref
  loop
    update public.products
      set notes = replace(notes, r.legacy_quote_ref, r.quote_ref)
      where notes is not null and strpos(notes, r.legacy_quote_ref) > 0;

    update public.quotes
      set notes = replace(notes, r.legacy_quote_ref, r.quote_ref)
      where notes is not null and strpos(notes, r.legacy_quote_ref) > 0;

    update public.purchase_orders
      set notes = replace(notes, r.legacy_quote_ref, r.quote_ref)
      where notes is not null and strpos(notes, r.legacy_quote_ref) > 0;

    update public.purchase_order_items
      set notes = replace(notes, r.legacy_quote_ref, r.quote_ref)
      where notes is not null and strpos(notes, r.legacy_quote_ref) > 0;
  end loop;
end $$;
