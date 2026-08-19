create table if not exists public.pricing_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  action_type text not null check (action_type in ('Increase','Hold','Protect Margin','Promote','Clearance','Needs Data')),
  status text not null default 'Reviewed' check (status in ('Reviewed','Applied','Dismissed')),
  current_price_cad numeric,
  recommended_price_cad numeric,
  applied_price_cad numeric,
  market_reference_cad numeric,
  market_source text,
  unit_cost_cad numeric,
  cost_source text,
  target_margin_pct numeric,
  expected_margin_pct numeric,
  inventory_units numeric,
  weighted_age_days numeric,
  sell_through_90_pct numeric,
  annualized_turns numeric,
  rationale text,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  applied_at timestamptz
);

create index if not exists idx_pricing_reviews_product_created
  on public.pricing_reviews(product_id, created_at desc);

alter table public.pricing_reviews enable row level security;

drop policy if exists "members all pricing reviews" on public.pricing_reviews;
create policy "members all pricing reviews" on public.pricing_reviews
for all to authenticated
using (exists (select 1 from public.app_members m where m.user_id = (select auth.uid())))
with check (exists (select 1 from public.app_members m where m.user_id = (select auth.uid())));

revoke all on public.pricing_reviews from anon;
grant select, insert, update, delete on public.pricing_reviews to authenticated;

drop trigger if exists trg_pricing_reviews_updated_at on public.pricing_reviews;
create trigger trg_pricing_reviews_updated_at
before update on public.pricing_reviews
for each row execute function public.set_updated_at();

create or replace function public.apply_pricing_recommendation(
  p_product_id uuid,
  p_new_price_cad numeric,
  p_snapshot jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_review_id uuid;
  v_old_price numeric;
begin
  if p_new_price_cad is null or p_new_price_cad < 0 then
    raise exception 'Applied price must be zero or greater';
  end if;

  select target_sell_price_cad into v_old_price
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'Product not found';
  end if;

  update public.products
  set target_sell_price_cad = p_new_price_cad
  where id = p_product_id;

  insert into public.pricing_reviews (
    product_id, action_type, status, current_price_cad, recommended_price_cad,
    applied_price_cad, market_reference_cad, market_source, unit_cost_cad,
    cost_source, target_margin_pct, expected_margin_pct, inventory_units,
    weighted_age_days, sell_through_90_pct, annualized_turns, rationale,
    notes, created_by, applied_at
  ) values (
    p_product_id,
    coalesce(p_snapshot->>'action_type','Hold'),
    'Applied',
    v_old_price,
    nullif(p_snapshot->>'recommended_price_cad','')::numeric,
    p_new_price_cad,
    nullif(p_snapshot->>'market_reference_cad','')::numeric,
    nullif(p_snapshot->>'market_source',''),
    nullif(p_snapshot->>'unit_cost_cad','')::numeric,
    nullif(p_snapshot->>'cost_source',''),
    nullif(p_snapshot->>'target_margin_pct','')::numeric,
    nullif(p_snapshot->>'expected_margin_pct','')::numeric,
    nullif(p_snapshot->>'inventory_units','')::numeric,
    nullif(p_snapshot->>'weighted_age_days','')::numeric,
    nullif(p_snapshot->>'sell_through_90_pct','')::numeric,
    nullif(p_snapshot->>'annualized_turns','')::numeric,
    nullif(p_snapshot->>'rationale',''),
    nullif(p_snapshot->>'notes',''),
    auth.uid(),
    now()
  ) returning id into v_review_id;

  return v_review_id;
end;
$$;

grant execute on function public.apply_pricing_recommendation(uuid,numeric,jsonb) to authenticated;
revoke execute on function public.apply_pricing_recommendation(uuid,numeric,jsonb) from anon;
