-- Costa Gear Sourcing, Phase 1 foundation
-- Applied to Supabase project xioqglqjwygveqllepmb on 2026-08-18.

create schema if not exists app_private;

create table if not exists public.app_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','admin','editor','viewer')),
  created_at timestamptz not null default now()
);

create table if not exists public.app_allowed_emails (
  email text primary key,
  role text not null default 'viewer' check (role in ('owner','admin','editor','viewer')),
  created_at timestamptz not null default now()
);

alter table public.app_members enable row level security;
alter table public.app_allowed_emails enable row level security;

insert into public.app_allowed_emails(email, role)
values ('84.fcosta@gmail.com', 'owner')
on conflict (email) do update set role = excluded.role;

create or replace function app_private.bootstrap_first_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed_role text;
begin
  select a.role into allowed_role
  from public.app_allowed_emails a
  where lower(a.email) = lower(new.email)
  limit 1;

  if allowed_role is not null then
    insert into public.app_members(user_id, role)
    values (new.id, allowed_role)
    on conflict (user_id) do update set role = excluded.role;
  end if;
  return new;
end;
$$;

revoke all on function app_private.bootstrap_first_member() from public, anon, authenticated;

drop trigger if exists trg_bootstrap_first_member on auth.users;
create trigger trg_bootstrap_first_member
after insert on auth.users
for each row execute function app_private.bootstrap_first_member();

drop policy if exists "public all products" on public.products;
drop policy if exists "public all suppliers" on public.suppliers;
drop policy if exists "public all quotes" on public.quotes;

drop policy if exists "members read own membership" on public.app_members;
create policy "members read own membership"
on public.app_members for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "members all products" on public.products;
create policy "members all products"
on public.products for all
to authenticated
using (exists (select 1 from public.app_members m where m.user_id = (select auth.uid())))
with check (exists (select 1 from public.app_members m where m.user_id = (select auth.uid())));

drop policy if exists "members all suppliers" on public.suppliers;
create policy "members all suppliers"
on public.suppliers for all
to authenticated
using (exists (select 1 from public.app_members m where m.user_id = (select auth.uid())))
with check (exists (select 1 from public.app_members m where m.user_id = (select auth.uid())));

drop policy if exists "members all quotes" on public.quotes;
create policy "members all quotes"
on public.quotes for all
to authenticated
using (exists (select 1 from public.app_members m where m.user_id = (select auth.uid())))
with check (exists (select 1 from public.app_members m where m.user_id = (select auth.uid())));

revoke all on table public.app_allowed_emails from anon, authenticated;

create index if not exists idx_quotes_product_id on public.quotes(product_id);
create index if not exists idx_quotes_supplier_id on public.quotes(supplier_id);
create index if not exists idx_quotes_created_at on public.quotes(created_at desc);
create index if not exists idx_quotes_quote_date on public.quotes(quote_date desc);
