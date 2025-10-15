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
  -- 1) Release ONLY current active holds (avoid double-refund of reservations)
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

  /*
    2) Compute per-company NET debits to reverse for this order:
       to_credit = sum(debit) - sum(credit)  (>= 0)
       (If you previously credited on reopen, this prevents double-credit.)
       We anchor on order_company to guarantee a company_id, and also include any
       transaction rows that already have company_id set.
  */
  drop table if exists _del_rev;
  create temporary table _del_rev (
    company_id bigint not null,
    total_debit numeric(18,2) not null,
    total_credit numeric(18,2) not null,
    to_credit numeric(18,2) not null
  ) on commit drop;

  insert into _del_rev (company_id, total_debit, total_credit, to_credit)
  with companies as (
    select company_id from order_company where order_id = p_order_id
    union
    select distinct company_id from credit_transactions
     where order_id = p_order_id and company_id is not null
  ),
  agg as (
    select
      c.company_id,
      coalesce(sum(case when ct.transaction_type = 'debit'  then ct.amount else 0 end),0)::numeric(18,2) as total_debit,
      coalesce(sum(case when ct.transaction_type = 'credit' then ct.amount else 0 end),0)::numeric(18,2) as total_credit
    from companies c
    left join credit_transactions ct
      on ct.order_id = p_order_id
     and (ct.company_id = c.company_id or ct.company_id is null)
    group by c.company_id
  )
  select
    a.company_id,
    a.total_debit,
    a.total_credit,
    greatest(round(a.total_debit - a.total_credit, 2), 0.00) as to_credit
  from agg a;

  -- 3) DELETE all debit rows for this order (per your request)
  delete from credit_transactions
  where order_id = p_order_id
    and transaction_type = 'debit';

  -- 4) Post reversing CREDITS equal to the (net) debits
  insert into credit_transactions (company_id, amount, transaction_type, description, order_id, created_by)
  select
    r.company_id,
    r.to_credit,
    'credit',
    'Order deletion: reversing debits',
    p_order_id,
    p_user_id
  from _del_rev r
  where r.to_credit > 0.00;

  -- 5) Update company summaries for the credits we just posted
  update company_credit_summary s
     set available_balance = s.available_balance + x.delta,
         last_updated = current_timestamp
    from (
      select company_id, sum(to_credit)::numeric(18,2) as delta
      from _del_rev
      where to_credit > 0.00
      group by company_id
    ) x
   where s.company_id = x.company_id;

  -- 6) Detach remaining tx/holds from the order to satisfy FKs but keep history
  --    (requires nullable or ON DELETE SET NULL FKs)
  update credit_transactions set order_id = null where order_id = p_order_id;
  update credit_holds          set order_id = null where order_id = p_order_id;

  -- 7) Delete dependents, then the order
  delete from order_products_company where order_id = p_order_id;
  delete from order_pre_assignments   where order_id = p_order_id;
  delete from allocation_results      where order_id = p_order_id;
  delete from order_products          where order_id = p_order_id;
  delete from order_company           where order_id = p_order_id;
  delete from orders                  where order_id = p_order_id;
end;
$$;
