-- ════════════════════════════════════════════════════════
-- COSTA GEAR – Sourcing Tracker
-- Run this entire script in Supabase → SQL Editor → New query
-- ════════════════════════════════════════════════════════

-- 1. SUPPLIERS
create table if not exists suppliers (
  id            uuid primary key default gen_random_uuid(),
  sup_id        text not null,
  name          text not null,
  platform      text,
  contact       text,
  response_time text,
  rating        numeric(2,1),
  status        text default 'Active',
  notes         text,
  created_at    timestamptz default now()
);

-- 2. PRODUCTS
create table if not exists products (
  id           uuid primary key default gen_random_uuid(),
  sku_id       text not null unique,
  product_type text,
  material     text,
  fitment      text,
  name         text,
  category     text,
  length_cm    numeric,
  width_cm     numeric,
  height_cm    numeric,
  weight_kg    numeric,
  notes        text,
  created_at   timestamptz default now()
);

-- 3. QUOTES
create table if not exists quotes (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid references products(id) on delete cascade,
  supplier_id     uuid references suppliers(id) on delete cascade,
  cg_sku          text,
  product_name    text,
  supplier_sku    text,
  supplier_name   text,
  unit_price      numeric(10,2),
  moq             text,
  incoterm        text,
  shipping_method text,
  notes           text,
  quote_date      date,
  created_at      timestamptz default now()
);

-- ── Enable public read/write (no auth for now) ──────────────
alter table suppliers enable row level security;
alter table products  enable row level security;
alter table quotes    enable row level security;

create policy "public all suppliers" on suppliers for all using (true) with check (true);
create policy "public all products"  on products  for all using (true) with check (true);
create policy "public all quotes"    on quotes    for all using (true) with check (true);

-- ════════════════════════════════════════════════════════
-- SEED DATA
-- ════════════════════════════════════════════════════════

-- Suppliers
insert into suppliers (sup_id, name, platform, contact, status, notes) values
  ('SUP-001', 'Raymond (Changzhou) Automotive Technology Co., Ltd', 'Alibaba', 'Raymond',    'Active', 'Excel catalog received for Wrangler JL. No pricing provided yet.'),
  ('SUP-002', 'Danyang Stark Auto Parts',                           'Alibaba', 'Ruby Yang',  'Active', 'Also trades as Gobison. Contact: ruby@stark4wd.com / WhatsApp +86 13775331569. PDF catalog received — no pricing.'),
  ('SUP-003', 'Danyang Jiepai Yize Auto Parts Factory',            'Alibaba', 'Krystal Tan','Active', 'VEJIA brand. WhatsApp +86 15312350787. Bilingual catalog received. Prefers Alibaba until first order. No pricing.'),
  ('SUP-004', 'Spedking (Danyang) Auto Parts Co., Ltd',            'Alibaba', 'Esther Sun', 'Active', 'Contact: esther@spedking.com / WhatsApp +86 15952943350. Full USD price list received. MOQ 10 units. EXW.');

-- Products
insert into products (sku_id, product_type, material, fitment, name, category, length_cm, width_cm, height_cm, weight_kg, notes) values
  ('CG-001', 'Side Steps',             'Steel / ABS / Aluminum', 'Wrangler JL 4-Door',          'Side Steps – Steel / ABS / Aluminum – Wrangler JL 4-Door',            'Exterior – Access & Entry',    197, 25,   22.5, 15.9, 'Multiple material variants. See quotes for breakdown.'),
  ('CG-002', 'Roof Rack',              'Aluminum / Steel',       'Wrangler JL 2-Door & 4-Door', 'Roof Rack – Aluminum / Steel – Wrangler JL 2-Door & 4-Door',          'Exterior – Storage & Cargo',   173, 23,   20,   32,   'Range from crossbar-style to full platform rack.'),
  ('CG-003', 'Dash Mount Phone Holder','ABS',                    'Wrangler JL & Gladiator JT',  'Dash Mount Phone Holder – ABS – Wrangler JL & Gladiator JT', 'Interior – Mounting & Tech', 44,  9.5,  7.5,  null, 'Dashboard storage box with integrated phone holder. 2018–2023 JL/JT. Spedking SKU SKJLP024.');

-- Quotes (Spedking only – other suppliers pending pricing)
-- We need the supplier and product UUIDs generated above, so we use subqueries
insert into quotes (product_id, supplier_id, cg_sku, product_name, supplier_sku, supplier_name, unit_price, moq, incoterm, notes, quote_date)
select
  p.id, s.id,
  'CG-001',
  'Side Steps – Steel / ABS / Aluminum – Wrangler JL 4-Door',
  v.supplier_sku, 'Spedking (Danyang) Auto Parts Co., Ltd',
  v.unit_price, '10', 'EXW', v.notes, current_date
from
  products p,
  suppliers s,
  (values
    ('SKJLM001', 180.95, 'Steel, blade style. 197×25×22.5 cm, 15.9 kg.'),
    ('SKJLM002', 200.00, 'Steel, heavier variant. 197×25×22.5 cm, 30 kg.'),
    ('SKJLM003', 152.38, 'Steel, budget variant. 197×25×22.5 cm, 15.9 kg.'),
    ('SKJLM004',  57.14, 'ABS plastic. 197×25×22.5 cm, 15.9 kg.'),
    ('SKJLM010', 104.76, 'Aluminum 4-door. 191×23×23 cm, 19 kg.'),
    ('SKJLM006', 161.90, 'Steel, wide step. 190×37×32 cm, 39 kg.')
  ) as v(supplier_sku, unit_price, notes)
where p.sku_id = 'CG-001' and s.sup_id = 'SUP-004';

insert into quotes (product_id, supplier_id, cg_sku, product_name, supplier_sku, supplier_name, unit_price, moq, incoterm, notes, quote_date)
select
  p.id, s.id,
  'CG-002',
  'Roof Rack – Aluminum / Steel – Wrangler JL 2-Door & 4-Door',
  v.supplier_sku, 'Spedking (Danyang) Auto Parts Co., Ltd',
  v.unit_price, '10', 'EXW', v.notes, current_date
from
  products p,
  suppliers s,
  (values
    ('SKJLK001', 228.57, 'Aluminum platform rack. 173×23×20 cm, 32 kg.'),
    ('SKJLK002', 314.29, 'Full luggage rack. 154×36×26 cm, 35 kg.'),
    ('SKJLK005', 228.57, 'Aluminum/steel combo. 165×32×13 cm, 26 kg.'),
    ('SKJLK006',  57.14, 'Cross bar style, aluminum. 158×22×12 cm, 8.5 kg.'),
    ('SKJLK007',  38.10, 'Cross bar style, smaller. 133×27×10 cm, 5.5 kg.')
  ) as v(supplier_sku, unit_price, notes)
where p.sku_id = 'CG-002' and s.sup_id = 'SUP-004';

insert into quotes (product_id, supplier_id, cg_sku, product_name, supplier_sku, supplier_name, unit_price, moq, incoterm, notes, quote_date)
select
  p.id, s.id,
  'CG-003',
  'Dash Mount Phone Holder – ABS – Wrangler JL & Gladiator JT',
  'SKJLP024', 'Spedking (Danyang) Auto Parts Co., Ltd',
  11.05, '10', 'EXW', 'Dashboard storage box with phone holder. 44×9.5×7.5 cm. 2018–2023 JL/JT.', current_date
from products p, suppliers s
where p.sku_id = 'CG-003' and s.sup_id = 'SUP-004';
