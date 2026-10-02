-- Applied to Supabase project xioqglqjwygveqllepmb on 2026-10-02.
-- Simplifies Costa Gear quotation references to one global sequential key: QUO001, QUO002, ...

create sequence if not exists public.supplier_quotation_ref_seq;

update public.supplier_quotations
set supplier_quote_ref = quote_ref
where supplier_quote_ref is null
  and quote_ref is not null
  and quote_ref !~ '^CGQ-'
  and quote_ref !~ '^QUO[0-9]+$';

with ranked as (
  select id, row_number() over (order by created_at, id)::integer as n
  from public.supplier_quotations
)
update public.supplier_quotations q
set quote_ref = 'QUO' || lpad(r.n::text, 3, '0')
from ranked r
where q.id = r.id
  and q.quote_ref !~ '^QUO[0-9]+$';

do $$
declare
  v_max integer;
begin
  select coalesce(max(substring(quote_ref from 4)::integer), 0)
    into v_max
  from public.supplier_quotations
  where quote_ref ~ '^QUO[0-9]+$';

  if v_max = 0 then
    perform setval('public.supplier_quotation_ref_seq', 1, false);
  else
    perform setval('public.supplier_quotation_ref_seq', v_max, true);
  end if;
end $$;

create unique index if not exists supplier_quotations_quote_ref_global_uk
  on public.supplier_quotations (quote_ref);

create or replace function public.assign_supplier_quotation_ref()
returns trigger
language plpgsql
set search_path = 'public'
as $$
begin
  if new.supplier_quote_ref is null
     and new.quote_ref is not null
     and new.quote_ref !~ '^CGQ-'
     and new.quote_ref !~ '^QUO[0-9]+$' then
    new.supplier_quote_ref := new.quote_ref;
  end if;

  new.quote_ref := 'QUO' || lpad(nextval('public.supplier_quotation_ref_seq')::text, 3, '0');
  return new;
end;
$$;

drop trigger if exists trg_assign_supplier_quotation_ref on public.supplier_quotations;

create trigger trg_assign_supplier_quotation_ref
before insert on public.supplier_quotations
for each row
execute function public.assign_supplier_quotation_ref();
