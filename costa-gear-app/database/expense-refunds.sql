-- Costa Gear expense refunds
-- Keep stored amounts positive and use transaction_type to determine accounting sign.

alter table public.business_expenses
  add column if not exists transaction_type text not null default 'Expense',
  add column if not exists original_expense_id uuid null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='business_expenses_transaction_type_check') then
    alter table public.business_expenses
      add constraint business_expenses_transaction_type_check
      check (transaction_type in ('Expense','Refund'));
  end if;

  if not exists (select 1 from pg_constraint where conname='business_expenses_original_expense_id_fkey') then
    alter table public.business_expenses
      add constraint business_expenses_original_expense_id_fkey
      foreign key (original_expense_id)
      references public.business_expenses(id)
      on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname='business_expenses_original_not_self_check') then
    alter table public.business_expenses
      add constraint business_expenses_original_not_self_check
      check (original_expense_id is null or original_expense_id <> id);
  end if;

  if not exists (select 1 from pg_constraint where conname='business_expenses_original_only_for_refund_check') then
    alter table public.business_expenses
      add constraint business_expenses_original_only_for_refund_check
      check (transaction_type='Refund' or original_expense_id is null);
  end if;
end $$;

create index if not exists business_expenses_original_expense_id_idx
  on public.business_expenses(original_expense_id)
  where original_expense_id is not null;
