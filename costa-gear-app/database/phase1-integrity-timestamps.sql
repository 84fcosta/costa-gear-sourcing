-- Phase 1 closeout: basic integrity and traceability
-- Applied to production on 2026-08-18.

alter table public.suppliers
  add constraint suppliers_sup_id_key unique (sup_id);

alter table public.products add column if not exists updated_at timestamptz not null default now();
alter table public.suppliers add column if not exists updated_at timestamptz not null default now();
alter table public.quotes add column if not exists updated_at timestamptz not null default now();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.set_updated_at() from anon, authenticated;

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at before update on public.products
for each row execute function public.set_updated_at();

drop trigger if exists trg_suppliers_updated_at on public.suppliers;
create trigger trg_suppliers_updated_at before update on public.suppliers
for each row execute function public.set_updated_at();

drop trigger if exists trg_quotes_updated_at on public.quotes;
create trigger trg_quotes_updated_at before update on public.quotes
for each row execute function public.set_updated_at();
