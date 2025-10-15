create or replace function public.admin_release_credit_and_delete_order(
  p_order_id integer,
  p_user_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r_hold record;
begin
  -- 1) Release ONLY current active holds (avoid double-refund)
  for r_hold in
    select h.hold_id, h.company_id, h.amount
      from credit_holds h
     where h.order_id = p_order_id
       and h.status = 'active'
     for update
  loop
    insert into credit_transactions (company_id, amount, transaction_type, description, order_id, created_by)
    values (r_hold.company_id, r_hold.amount, 'release', 'Auto release on order deletion', p_order_id, p_user_id);

    update credit_holds
       set status = 'released',
           released_at = current_timestamp
     where hold_id = r_hold.hold_id;

    update company_credit_summary
       set held_balance = held_balance - r_hold.amount,
           available_balance = available_balance + r_hold.amount,
           last_updated = current_timestamp
     where company_id = r_hold.company_id;
  end loop;

  -- 2) Compute per-company balancing amounts into a temp table (so we can reuse it)
  create temporary table if not exists _del_need (
    company_id bigint not null,
    to_credit numeric(18,2) not null
  ) on commit drop;

  delete from _del_need; -- clear from previous calls in the same session

  insert into _del_need (company_id, to_credit)
  with companies as (
    -- Anchor on both order_company and any existing credit_transactions (tolerate legacy NULL company_id)
    select company_id from order_company where order_id = p_order_id
    union
    select distinct company_id
    from credit_transactions
    where order_id = p_order_id and company_id is not null
  ),
  tx as (
    select
      c.company_id as company_id,
      sum(case when ct.transaction_type = 'debit'  then ct.amount else 0 end)::numeric(18,2) as total_debit,
      sum(case when ct.transaction_type = 'credit' then ct.amount else 0 end)::numeric(18,2) as total_credit
    from companies c
    left join credit_transactions ct
      on ct.order_id = p_order_id
     and (ct.company_id = c.company_id or ct.company_id is null)
    group by c.company_id
  )
  select
    t.company_id,
    round( (t.total_debit - t.total_credit), 2 ) as to_credit
  from tx t
  where round( (t.total_debit - t.total_credit), 2 ) > 0.00;

  -- 3) Post balancing credits (reinstate debits 1:1 that haven’t been credited yet)
  insert into credit_transactions (company_id, amount, transaction_type, description, order_id, created_by)
  select
    n.company_id,
    n.to_credit,
    'credit',
    'Order deletion: reversing prior debits',
    p_order_id,
    p_user_id
  from _del_need n;

  -- Reflect in available balance
  update company_credit_summary s
     set available_balance = s.available_balance + x.delta,
         last_updated = current_timestamp
    from (
      select company_id, sum(to_credit)::numeric(18,2) as delta
      from _del_need
      group by company_id
    ) x
   where s.company_id = x.company_id;

  -- 4) Detach FKs so we can safely delete the order but keep history
  -- (requires credit_transactions.order_id and credit_holds.order_id nullable or ON DELETE SET NULL)
  update credit_transactions set order_id = null where order_id = p_order_id;
  update credit_holds          set order_id = null where order_id = p_order_id;

  -- 5) Delete dependents, then the order
  delete from order_products_company where order_id = p_order_id;
  delete from order_pre_assignments   where order_id = p_order_id;
  delete from allocation_results      where order_id = p_order_id;
  delete from order_products          where order_id = p_order_id;
  delete from order_company           where order_id = p_order_id;
  delete from orders                  where order_id = p_order_id;
end;
$$;
