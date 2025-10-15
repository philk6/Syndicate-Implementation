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

  /*
    2) Reinstate debits with equal credits, per company.
       Logic per company:
         to_credit = total_debit_for_order - total_credit_already_for_order
       (Ignores holds/releases here on purpose; holds/releases are about reservation, not spend.)
       We compute by anchoring on order_company and coalescing CT.company_id.
  */
  with companies as (
    select distinct oc.company_id
    from order_company oc
    where oc.order_id = p_order_id
  ),
  tx as (
    select
      coalesce(ct.company_id, oc.company_id) as company_id,
      sum(case when ct.transaction_type = 'debit'  then ct.amount else 0 end)::numeric(18,2) as total_debit,
      sum(case when ct.transaction_type = 'credit' then ct.amount else 0 end)::numeric(18,2) as total_credit
    from companies oc
    left join credit_transactions ct
      on ct.order_id = p_order_id
     and (ct.company_id = oc.company_id or ct.company_id is null)  -- tolerate legacy null company_id
    group by coalesce(ct.company_id, oc.company_id)
  ),
  need as (
    select
      t.company_id,
      round( (t.total_debit - t.total_credit), 2 ) as to_credit
    from tx t
  )
  -- Insert balancing credit(s) where needed
  insert into credit_transactions (company_id, amount, transaction_type, description, order_id, created_by)
  select
    n.company_id,
    n.to_credit,
    'credit'::text,
    'Order deletion: reversing prior debits',
    p_order_id,
    p_user_id
  from need n
  where n.to_credit > 0.00;

  -- Reflect those credits in available balance
  update company_credit_summary s
     set available_balance = s.available_balance + x.delta,
         last_updated = current_timestamp
    from (
      select company_id, sum(to_credit)::numeric(18,2) as delta
      from need
      where to_credit > 0.00
      group by company_id
    ) x
   where s.company_id = x.company_id;

  -- 3) Detach FKs to keep history but allow row delete (requires nullable / ON DELETE SET NULL)
  update credit_transactions set order_id = null where order_id = p_order_id;
  update credit_holds          set order_id = null where order_id = p_order_id;

  -- 4) Delete dependents then the order
  delete from order_products_company where order_id = p_order_id;
  delete from order_pre_assignments   where order_id = p_order_id;
  delete from allocation_results      where order_id = p_order_id;
  delete from order_products          where order_id = p_order_id;
  delete from order_company           where order_id = p_order_id;
  delete from orders                  where order_id = p_order_id;
end;
$$;
