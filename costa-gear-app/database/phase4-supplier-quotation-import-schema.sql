-- Costa Gear standardized supplier quotation import
-- Applied to production as migration: supplier_quotation_bulk_import_schema

create table public.supplier_quotations (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  quote_ref text not null,
  quote_date date,
  currency text not null default 'USD',
  incoterm text,
  shipping_method text,
  shipping_total numeric,
  shipping_currency text default 'USD',
  product_subtotal numeric,
  grand_total numeric,
  transit_time_days integer,
  dispatch_lead_time_days integer,
  packaging text,
  payment_terms text,
  notes text,
  validation_status text not null default 'NOT CHECKED',
  allocation_method text not null default 'value',
  usd_cad_rate numeric,
  duty_rate_pct numeric,
  status text not null default 'Imported',
  purchase_order_id uuid references public.purchase_orders(id) on delete set null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_quotations_supplier_ref_uk unique (supplier_id, quote_ref),
  constraint supplier_quotations_shipping_nonnegative check (shipping_total is null or shipping_total >= 0),
  constraint supplier_quotations_subtotal_nonnegative check (product_subtotal is null or product_subtotal >= 0),
  constraint supplier_quotations_total_nonnegative check (grand_total is null or grand_total >= 0),
  constraint supplier_quotations_transit_nonnegative check (transit_time_days is null or transit_time_days >= 0),
  constraint supplier_quotations_dispatch_nonnegative check (dispatch_lead_time_days is null or dispatch_lead_time_days >= 0),
  constraint supplier_quotations_fx_positive check (usd_cad_rate is null or usd_cad_rate > 0),
  constraint supplier_quotations_duty_valid check (duty_rate_pct is null or (duty_rate_pct >= 0 and duty_rate_pct <= 100)),
  constraint supplier_quotations_validation_ck check (validation_status in ('PASS','REVIEW REQUIRED','NOT CHECKED')),
  constraint supplier_quotations_allocation_ck check (allocation_method in ('value','quantity','weight','volume','equal')),
  constraint supplier_quotations_status_ck check (status in ('Imported','Finalized','Converted','Cancelled'))
);

create table public.supplier_product_mappings (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  supplier_sku text not null,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_product_mappings_uk unique (supplier_id, supplier_sku)
);

create table public.supplier_quotation_lines (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.supplier_quotations(id) on delete cascade,
  line_no integer not null,
  supplier_sku text,
  supplier_description text,
  unit text,
  quantity numeric not null,
  unit_price numeric,
  supplier_line_total numeric,
  calculated_line_total numeric,
  line_validation text not null default 'NOT CHECKED',
  original_notes text,
  source_cg_sku text,
  product_id uuid references public.products(id) on delete set null,
  match_status text not null default 'UNMATCHED',
  allocated_shipping_cad numeric,
  allocated_shipping_per_unit_cad numeric,
  quote_id uuid references public.quotes(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_quotation_lines_uk unique (quotation_id, line_no),
  constraint supplier_quotation_lines_qty_positive check (quantity > 0),
  constraint supplier_quotation_lines_price_nonnegative check (unit_price is null or unit_price >= 0),
  constraint supplier_quotation_lines_total_nonnegative check (supplier_line_total is null or supplier_line_total >= 0),
  constraint supplier_quotation_lines_validation_ck check (line_validation in ('PASS','REVIEW REQUIRED','NOT CHECKED')),
  constraint supplier_quotation_lines_match_ck check (match_status in ('MATCHED','REVIEW','UNMATCHED','NEW PRODUCT'))
);

alter table public.quotes
  add column if not exists supplier_quotation_id uuid references public.supplier_quotations(id) on delete set null,
  add column if not exists quotation_line_id uuid references public.supplier_quotation_lines(id) on delete set null,
  add column if not exists quoted_quantity numeric,
  add column if not exists quoted_unit text,
  add column if not exists supplier_line_total numeric;

create unique index if not exists idx_quotes_quotation_line_unique on public.quotes(quotation_line_id) where quotation_line_id is not null;
create index if not exists idx_supplier_quotations_supplier on public.supplier_quotations(supplier_id, quote_date desc);
create index if not exists idx_supplier_quotation_lines_quotation on public.supplier_quotation_lines(quotation_id, line_no);
create index if not exists idx_supplier_quotation_lines_product on public.supplier_quotation_lines(product_id);
create index if not exists idx_supplier_product_mappings_product on public.supplier_product_mappings(product_id);

create trigger trg_supplier_quotations_updated_at before update on public.supplier_quotations for each row execute function public.set_updated_at();
create trigger trg_supplier_product_mappings_updated_at before update on public.supplier_product_mappings for each row execute function public.set_updated_at();
create trigger trg_supplier_quotation_lines_updated_at before update on public.supplier_quotation_lines for each row execute function public.set_updated_at();

alter table public.supplier_quotations enable row level security;
alter table public.supplier_product_mappings enable row level security;
alter table public.supplier_quotation_lines enable row level security;

create policy "members all supplier quotations" on public.supplier_quotations for all to authenticated
using (exists (select 1 from public.app_members m where m.user_id = (select auth.uid())))
with check (exists (select 1 from public.app_members m where m.user_id = (select auth.uid())));

create policy "members all supplier product mappings" on public.supplier_product_mappings for all to authenticated
using (exists (select 1 from public.app_members m where m.user_id = (select auth.uid())))
with check (exists (select 1 from public.app_members m where m.user_id = (select auth.uid())));

create policy "members all supplier quotation lines" on public.supplier_quotation_lines for all to authenticated
using (exists (select 1 from public.app_members m where m.user_id = (select auth.uid())))
with check (exists (select 1 from public.app_members m where m.user_id = (select auth.uid())));

grant select, insert, update, delete on public.supplier_quotations to authenticated;
grant select, insert, update, delete on public.supplier_product_mappings to authenticated;
grant select, insert, update, delete on public.supplier_quotation_lines to authenticated;

with candidate as (
  select q.supplier_id, q.supplier_sku, (array_agg(distinct q.product_id))[1] as product_id
  from public.quotes q
  where q.supplier_id is not null
    and nullif(trim(q.supplier_sku),'') is not null
    and q.product_id is not null
  group by q.supplier_id, q.supplier_sku
  having count(distinct q.product_id)=1
)
insert into public.supplier_product_mappings(supplier_id,supplier_sku,product_id)
select supplier_id,supplier_sku,product_id from candidate
on conflict (supplier_id,supplier_sku) do nothing;
