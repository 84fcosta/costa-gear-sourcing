-- Costa Gear MVP operational-readiness guard
-- Transactional Sourcing -> Buying handoff.
-- The PO header and first PO item are created in one database transaction.

create or replace function public.create_buying_draft_from_quote(
  p_quote_id uuid,
  p_quantity integer,
  p_landed_cost_per_unit_cad numeric,
  p_target_sell_price_cad numeric default null,
  p_decision_score numeric default null
)
returns table (purchase_order_id uuid, po_ref text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  q public.quotes%rowtype;
  v_po_id uuid;
  v_po_ref text;
begin
  if p_quantity is null or p_quantity < 1 then
    raise exception 'Buying draft quantity must be at least 1.';
  end if;
  if p_landed_cost_per_unit_cad is null or p_landed_cost_per_unit_cad <= 0 then
    raise exception 'Complete the landed cost before creating a buying draft.';
  end if;

  select * into q from public.quotes where id = p_quote_id;
  if not found then
    raise exception 'Quote not found.';
  end if;
  if q.product_id is null or q.supplier_id is null then
    raise exception 'Quote must be linked to both a product and supplier.';
  end if;
  if q.usd_cad_rate is null or q.usd_cad_rate <= 0 then
    raise exception 'Confirm the USD/CAD rate on the quote before creating a buying draft.';
  end if;

  v_po_ref := 'PO-' || to_char(current_date, 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.purchase_orders (
    po_ref, supplier_id, status, currency, usd_cad_rate, notes, created_by
  ) values (
    v_po_ref, q.supplier_id, 'Draft', 'USD', q.usd_cad_rate,
    'Created from Sourcing Decision Lab. Decision Score ' || coalesce(round(p_decision_score, 2)::text, 'N/A') || '.',
    auth.uid()
  ) returning id into v_po_id;

  insert into public.purchase_order_items (
    purchase_order_id, product_id, quote_id, quantity, moq_text, supplier_sku,
    unit_price_usd, landed_cost_per_unit_cad, target_sell_price_cad, notes
  ) values (
    v_po_id, q.product_id, q.id, p_quantity, q.moq, q.supplier_sku,
    q.unit_price, p_landed_cost_per_unit_cad, p_target_sell_price_cad,
    'Sourcing recommendation snapshot. Decision Score ' || coalesce(round(p_decision_score, 2)::text, 'N/A') || '.'
  );

  return query select v_po_id, v_po_ref;
end;
$$;

revoke all on function public.create_buying_draft_from_quote(uuid, integer, numeric, numeric, numeric) from public;
grant execute on function public.create_buying_draft_from_quote(uuid, integer, numeric, numeric, numeric) to authenticated;
