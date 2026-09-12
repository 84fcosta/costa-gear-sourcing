-- Secure supplier document metadata with the same app-member access model used elsewhere.
alter table public.supplier_documents enable row level security;

drop policy if exists "members all supplier documents" on public.supplier_documents;

create policy "members all supplier documents"
on public.supplier_documents
for all
to authenticated
using (
  exists (
    select 1
    from public.app_members m
    where m.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.app_members m
    where m.user_id = (select auth.uid())
  )
);

revoke all on table public.supplier_documents from anon;
revoke all on table public.supplier_documents from authenticated;
grant select, insert, update, delete on table public.supplier_documents to authenticated;
