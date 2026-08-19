-- Phase 2: operational dashboard inventory threshold
-- Applied to production on 2026-08-18.

alter table public.products
  add column if not exists reorder_point integer not null default 0 check (reorder_point >= 0);
