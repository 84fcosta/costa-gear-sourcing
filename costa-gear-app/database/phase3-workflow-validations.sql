-- Phase 3 UX refinement: workflow integrity rules

create or replace function public.validate_purchase_order_state()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status in ('Approved','Ordered') then
    if not exists (
      select 1 from public.purchase_order_items i
      where i.purchase_order_id = new.id
    ) then
      raise exception 'Add at least one product before setting a buying decision to %.', new.status;
    end if;
  end if;

  if new.status = 'Ordered' and new.order_date is null then
    raise exception 'Order Date is required before a buying decision can be marked Ordered.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_purchase_order_state on public.purchase_orders;
create trigger trg_validate_purchase_order_state
before insert or update on public.purchase_orders
for each row execute function public.validate_purchase_order_state();

create or replace function public.validate_receipt_posting()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'Posted' then
    if new.received_date is null then
      raise exception 'Received Date is required before posting a receipt.';
    end if;
    if not exists (
      select 1 from public.receipt_items i
      where i.receipt_id = new.id
    ) then
      raise exception 'Add at least one received item before posting a receipt.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_receipt_posting on public.receipts;
create trigger trg_validate_receipt_posting
before insert or update on public.receipts
for each row execute function public.validate_receipt_posting();
