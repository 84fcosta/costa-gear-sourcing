create or replace function public.delete_supplier_quotation_draft(p_quotation_id uuid)
returns text
language plpgsql
set search_path to 'public'
as $function$
declare
  v_q public.supplier_quotations;
begin
  if not exists (
    select 1 from public.app_members m where m.user_id = auth.uid()
  ) then
    raise exception 'Not authorized.';
  end if;

  select *
    into v_q
  from public.supplier_quotations
  where id = p_quotation_id
  for update;

  if not found then
    raise exception 'Supplier quotation not found.';
  end if;

  if v_q.status <> 'Imported' then
    raise exception 'Only an Imported quotation can be deleted. Finalized or converted quotations must be preserved.';
  end if;

  if v_q.purchase_order_id is not null then
    raise exception 'This quotation is linked to a Buying Draft and cannot be deleted.';
  end if;

  if exists (
    select 1
    from public.quotes q
    where q.supplier_quotation_id = p_quotation_id
  ) or exists (
    select 1
    from public.supplier_quotation_lines l
    where l.quotation_id = p_quotation_id
      and l.quote_id is not null
  ) then
    raise exception 'This quotation already generated comparable quote records and cannot be deleted.';
  end if;

  if exists (
    select 1
    from public.supplier_documents d
    where d.quotation_id = p_quotation_id
  ) then
    raise exception 'Remove the quotation documents from OneDrive before deleting this draft.';
  end if;

  if exists (
    select 1
    from public.onedrive_items oi
    where oi.linked_entity_type = 'supplier_quotation'
      and oi.linked_entity_id = p_quotation_id
      and coalesce(oi.is_deleted,false) = false
  ) then
    raise exception 'Active OneDrive files are still linked to this quotation.';
  end if;

  delete from public.supplier_quotations
  where id = p_quotation_id;

  return v_q.quote_ref;
end;
$function$;

grant execute on function public.delete_supplier_quotation_draft(uuid) to authenticated;
