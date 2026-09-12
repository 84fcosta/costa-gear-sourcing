-- Product fitment data corrections supporting structured Vehicle Model + Model Year filters.
-- Evidence reviewed before applying:
-- CG-PH-06: supplier quote notes + Vehicle Master establish JLU 4xe starts in 2021.
-- CG-DS-02: supplier catalog confirms Wrangler JL/JLU 18+ variants.
-- CG-RR-01: supplier catalog identifies Wrangler JL rack; JL/JLU structured rows normalized to 2018+.
-- CG-RR-02: supplier quotation states Jeep Wrangler 2018+; JL/JLU structured rows normalized to 2018+.
-- Unconfirmed JK/JT legacy rows remain intentionally without year_from pending product-specific evidence.

update public.product_fitments pf
set year_from = 2021,
    year_to = 2023,
    updated_at = now()
from public.products p
where pf.product_id = p.id
  and p.sku_id = 'CG-PH-06'
  and pf.fitment_code = 'WRANGLER_JLU_4XE_4D'
  and pf.year_from = 2020
  and pf.year_to = 2023;

update public.products
set fitment = 'Wrangler JLU 4xe 4-Door 2021-2023 · Gladiator JT 4-Door 2020-2023',
    updated_at = now()
where sku_id = 'CG-PH-06';

update public.product_fitments pf
set year_from = 2018,
    updated_at = now()
from public.products p
where pf.product_id = p.id
  and p.sku_id = 'CG-DS-02'
  and pf.fitment_code in ('WRANGLER_JL_2D','WRANGLER_JLU_4D')
  and pf.year_from is null;

update public.products
set fitment = 'Wrangler JL 2-Door 2018+ · Wrangler JLU 4-Door 2018+ · Gladiator JT 4-Door',
    updated_at = now()
where sku_id = 'CG-DS-02';

update public.product_fitments pf
set year_from = 2018,
    updated_at = now()
from public.products p
where pf.product_id = p.id
  and p.sku_id = 'CG-RR-01'
  and pf.fitment_code in ('WRANGLER_JL_2D','WRANGLER_JLU_4D')
  and pf.year_from is null;

update public.products
set fitment = 'Wrangler JK 2-Door · Wrangler JKU 4-Door · Wrangler JL 2-Door 2018+ · Wrangler JLU 4-Door 2018+',
    updated_at = now()
where sku_id = 'CG-RR-01';

update public.product_fitments pf
set year_from = 2018,
    updated_at = now()
from public.products p
where pf.product_id = p.id
  and p.sku_id = 'CG-RR-02'
  and pf.fitment_code in ('WRANGLER_JL_2D','WRANGLER_JLU_4D')
  and pf.year_from is null;

update public.products
set fitment = 'Wrangler JK 2-Door · Wrangler JKU 4-Door · Wrangler JL 2-Door 2018+ · Wrangler JLU 4-Door 2018+ · Gladiator JT 4-Door',
    updated_at = now()
where sku_id = 'CG-RR-02';
