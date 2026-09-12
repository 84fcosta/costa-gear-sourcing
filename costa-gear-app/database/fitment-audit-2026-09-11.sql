-- Fitment audit corrections, 2026-09-11
-- Sources:
-- CG-RR-01: supplier SKU SKJLK001 in the supplier JL catalog identifies the item as Jeep Wrangler JL Rack Roof.
-- CG-RR-02: supplier quotation CGQ-SUP009-20260909-01 identifies the matched item as Jeep Wrangler 2018+.
-- CG-PH-06 was already corrected to JLU 4xe 2021-2023 when rechecked.
-- CG-DS-02 Gladiator JT start year remains unresolved pending stronger source evidence.

begin;

with target as (
  select id from public.products where sku_id='CG-RR-01'
)
delete from public.product_fitments
where product_id=(select id from target)
  and fitment_code not in ('WRANGLER_JL_2D','WRANGLER_JLU_4D');

update public.product_fitments pf
set year_from=2018,
    year_to=null,
    updated_at=now()
from public.products p
where pf.product_id=p.id
  and p.sku_id='CG-RR-01'
  and pf.fitment_code in ('WRANGLER_JL_2D','WRANGLER_JLU_4D');

update public.products
set name='Roof Rack Platform – Aluminum – Wrangler JL/JLU',
    updated_at=now()
where sku_id='CG-RR-01';

select public.refresh_product_fitment_display(
  (select id from public.products where sku_id='CG-RR-01')
);

with target as (
  select id from public.products where sku_id='CG-RR-02'
)
delete from public.product_fitments
where product_id=(select id from target)
  and fitment_code not in ('WRANGLER_JL_2D','WRANGLER_JLU_4D');

update public.product_fitments pf
set year_from=2018,
    year_to=null,
    updated_at=now()
from public.products p
where pf.product_id=p.id
  and p.sku_id='CG-RR-02'
  and pf.fitment_code in ('WRANGLER_JL_2D','WRANGLER_JLU_4D');

select public.refresh_product_fitment_display(
  (select id from public.products where sku_id='CG-RR-02')
);

commit;
