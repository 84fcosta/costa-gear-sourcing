-- Phase 2: explicit Data API grants for sourcing intelligence tables
-- Applied to production on 2026-08-18.

revoke all on table public.market_prices from anon;
revoke all on table public.supplier_scorecards from anon;

grant select, insert, update, delete on table public.market_prices to authenticated;
grant select, insert, update, delete on table public.supplier_scorecards to authenticated;
