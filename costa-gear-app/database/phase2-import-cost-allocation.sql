-- Phase 2: shipment import cost allocation
-- Applied to production on 2026-08-18.

alter table public.shipments
  add column if not exists brokerage_amount numeric(12,2) not null default 0 check (brokerage_amount >= 0),
  add column if not exists brokerage_currency text not null default 'CAD' check (brokerage_currency in ('USD','CAD')),
  add column if not exists other_import_costs_amount numeric(12,2) not null default 0 check (other_import_costs_amount >= 0),
  add column if not exists other_import_costs_currency text not null default 'CAD' check (other_import_costs_currency in ('USD','CAD')),
  add column if not exists import_allocation_method text not null default 'value' check (import_allocation_method in ('weight','volume','value','quantity','equal','manual'));

alter table public.shipment_items
  add column if not exists duty_rate_pct numeric(6,3) check (duty_rate_pct between 0 and 100),
  add column if not exists manual_brokerage_cad numeric(12,2) check (manual_brokerage_cad >= 0),
  add column if not exists manual_other_import_cad numeric(12,2) check (manual_other_import_cad >= 0),
  add column if not exists allocated_brokerage_cad numeric(12,2) check (allocated_brokerage_cad >= 0),
  add column if not exists allocated_brokerage_per_unit_cad numeric(12,4) check (allocated_brokerage_per_unit_cad >= 0),
  add column if not exists allocated_other_import_cad numeric(12,2) check (allocated_other_import_cad >= 0),
  add column if not exists allocated_other_import_per_unit_cad numeric(12,4) check (allocated_other_import_per_unit_cad >= 0);
