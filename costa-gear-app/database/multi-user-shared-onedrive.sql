-- Costa Gear Operations multi-user / shared OneDrive repository

create table if not exists public.onedrive_repository_config (
  repository_key text primary key,
  drive_id text not null,
  root_item_id text not null,
  root_name text not null,
  root_web_url text,
  owner_microsoft_account text,
  configured_by uuid references auth.users(id) on delete set null,
  configured_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.onedrive_repository_config enable row level security;

drop policy if exists "members read onedrive repository config" on public.onedrive_repository_config;
create policy "members read onedrive repository config"
on public.onedrive_repository_config
for select to authenticated
using (exists (select 1 from public.app_members m where m.user_id=(select auth.uid())));

drop policy if exists "owners manage onedrive repository config" on public.onedrive_repository_config;
create policy "owners manage onedrive repository config"
on public.onedrive_repository_config
for all to authenticated
using (exists (select 1 from public.app_members m where m.user_id=(select auth.uid()) and m.role='owner'))
with check (exists (select 1 from public.app_members m where m.user_id=(select auth.uid()) and m.role='owner'));

grant select, insert, update, delete on public.onedrive_repository_config to authenticated;

create table if not exists public.onedrive_repository_collaborators (
  email text primary key,
  access_role text not null default 'write',
  is_enabled boolean not null default true,
  invited_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.onedrive_repository_collaborators enable row level security;

drop policy if exists "members read onedrive collaborators" on public.onedrive_repository_collaborators;
create policy "members read onedrive collaborators"
on public.onedrive_repository_collaborators
for select to authenticated
using (exists (select 1 from public.app_members m where m.user_id=(select auth.uid())));

drop policy if exists "owners manage onedrive collaborators" on public.onedrive_repository_collaborators;
create policy "owners manage onedrive collaborators"
on public.onedrive_repository_collaborators
for all to authenticated
using (exists (select 1 from public.app_members m where m.user_id=(select auth.uid()) and m.role='owner'))
with check (exists (select 1 from public.app_members m where m.user_id=(select auth.uid()) and m.role='owner'));

grant select, insert, update, delete on public.onedrive_repository_collaborators to authenticated;

insert into public.onedrive_repository_collaborators(email,access_role,is_enabled)
values ('lutianne.carvalho@hotmail.com','write',true)
on conflict (email) do update
set access_role=excluded.access_role,is_enabled=true,updated_at=now();

-- Existing invite-only auth infrastructure remains authoritative:
-- app_private.allowed_emails already contains Felipe as owner and Lutianne as editor.
-- trg_enforce_allowed_auth_user prevents uninvited account creation.
-- trg_bootstrap_first_member creates app_members membership after an allowed user signs up.
