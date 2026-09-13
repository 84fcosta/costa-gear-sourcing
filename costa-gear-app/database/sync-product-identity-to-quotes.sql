create or replace function public.sync_product_identity_to_quotes()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  update public.quotes
  set product_name=new.name,
      cg_sku=new.sku_id
  where product_id=new.id
    and (
      product_name is distinct from new.name
      or cg_sku is distinct from new.sku_id
    );
  return new;
end;
$function$;

drop trigger if exists trg_products_sync_quote_identity on public.products;
create trigger trg_products_sync_quote_identity
after insert or update
on public.products
for each row
execute function public.sync_product_identity_to_quotes();

update public.quotes q
set product_name=p.name,
    cg_sku=p.sku_id
from public.products p
where q.product_id=p.id
  and (
    q.product_name is distinct from p.name
    or q.cg_sku is distinct from p.sku_id
  );
