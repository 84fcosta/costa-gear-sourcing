drop trigger if exists trg_products_sync_quote_identity on public.products;
create trigger trg_products_sync_quote_identity
after insert or update
on public.products
for each row
execute function public.sync_product_identity_to_quotes();
