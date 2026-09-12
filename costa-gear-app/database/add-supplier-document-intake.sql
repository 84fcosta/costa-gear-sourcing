create table if not exists public.supplier_documents (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  quotation_id uuid null references public.supplier_quotations(id) on delete cascade,
  document_type text not null check (document_type in (
    'QUOTATION_SOURCE',
    'QUOTATION_IMPORT',
    'CATALOG',
    'PRICE_LIST',
    'TECHNICAL',
    'OTHER_SOURCING'
  )),
  description text null,
  document_date date null,
  original_file_name text not null,
  file_name text not null,
  mime_type text null,
  size_bytes bigint null check (size_bytes is null or size_bytes >= 0),
  sha1_hash text null,
  onedrive_item_id text not null,
  onedrive_web_url text null,
  created_by uuid null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists supplier_documents_onedrive_item_uq
  on public.supplier_documents(onedrive_item_id);

create unique index if not exists supplier_quotation_document_role_uq
  on public.supplier_documents(quotation_id, document_type)
  where quotation_id is not null
    and document_type in ('QUOTATION_SOURCE','QUOTATION_IMPORT');

create index if not exists supplier_documents_supplier_idx
  on public.supplier_documents(supplier_id, created_at desc);

create index if not exists supplier_documents_quotation_idx
  on public.supplier_documents(quotation_id)
  where quotation_id is not null;

create index if not exists supplier_documents_sha1_idx
  on public.supplier_documents(supplier_id, sha1_hash)
  where sha1_hash is not null;

grant all on table public.supplier_documents to anon, authenticated;

update public.onedrive_items oi
set linked_entity_type = 'supplier',
    linked_entity_id = s.id
from public.suppliers s
where oi.is_folder = true
  and coalesce(oi.is_deleted,false) = false
  and oi.path like 'COSTA GEAR/02_PRODUCTS/Suppliers_Sourcing/%'
  and lower(oi.name) like lower(s.sup_id) || '\_%' escape '\'
  and (oi.linked_entity_id is null or oi.linked_entity_id = s.id);
