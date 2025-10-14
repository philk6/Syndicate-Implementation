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
  v_company_count int;
  v_desc_pattern text := 'Order #' || p_order_id::text || '%';
begin
  --------------------------------------------------------------------
  -- 1) Release ONLY currently-active holds
  --------------------------------------------------------------------
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

  --------------------------------------------------------------------
  -- 2) Build definitive company list for the order
  --------------------------------------------------------------------
  drop table if exists _del_companies;
  create temporary table _del_companies (
    company_id bigint primary key
  ) on commit drop;

  insert into _del_companies(company_id)
  select distinct company_id from order_company where order_id = p_order_id
  union
  select distinct company_id from credit_holds where order_id = p_order_id and company_id is not null
  union
  select distinct company_id from credit_transactions
   where (order_id = p_order_id or (order_id is null and description ilike v_desc_pattern))
     and company_id is not null
  union
  select distinct company_id from order_products_company where order_id = p_order_id;

  select count(*) into v_company_count from _del_companies;
  if v_company_count = 0 then
    raise exception 'No company found for order %; cannot reverse debits', p_order_id;
  end if;

  --------------------------------------------------------------------
  -- 3) Compute per-company net debits to reverse
  --    to_credit = sum(debit) - sum(credit)  (>= 0)
  --    If there is exactly ONE company, attribute any NULL-company tx to it.
  --------------------------------------------------------------------
  drop table if exists _del_rev;
  create temporary table _del_rev (
    company_id bigint not null,
    total_debit numeric(18,2) not null,
    total_credit numeric(18,2) not null,
    to_credit numeric(18,2) not null
  ) on commit drop;

  insert into _del_rev(company_id, total_debit, total_credit, to_credit)
  with ct_scoped as (
    select
      coalesce(ct.company_id,
               case when v_company_count = 1
                    then (select company_id from _del_companies limit 1)
                    else null end) as eff_company_id,
      ct.transaction_type,
      ct.amount
    from credit_transactions ct
    where (ct.order_id = p_order_id
           or (ct.order_id is null and (ct.description ilike v_desc_pattern
                                        or ct.description ilike '%Order #' || p_order_id::text || '%')))
  ),
  agg as (
    select
      c.company_id,
      coalesce(sum(case when s.transaction_type = 'debit'  and s.eff_company_id = c.company_id then s.amount else 0 end),0)::numeric(18,2) as total_debit,
      coalesce(sum(case when s.transaction_type = 'credit' and s.eff_company_id = c.company_id then s.amount else 0 end),0)::numeric(18,2) as total_credit
    from _del_companies c
    left join ct_scoped s
           on s.eff_company_id = c.company_id
    group by c.company_id
  )
  select
    a.company_id,
    a.total_debit,
    a.total_credit,
    greatest(round(a.total_debit - a.total_credit, 2), 0.00) as to_credit
  from agg a;

  -- Fallback: if nothing to credit yet (e.g., legacy rows didn’t map),
  -- re-compute by matching the order number in description for companies on this order.
  IF NOT EXISTS (SELECT 1 FROM _del_rev WHERE to_credit > 0.00) THEN
    insert into _del_rev (company_id, total_debit, total_credit, to_credit)
    with fb as (
      select
        oc.company_id,
        coalesce(sum(case when ct.transaction_type='debit'  then ct.amount else 0 end),0)::numeric(18,2) as total_debit,
        coalesce(sum(case when ct.transaction_type='credit' then ct.amount else 0 end),0)::numeric(18,2) as total_credit
      from order_company oc
      left join credit_transactions ct
        on ct.company_id = oc.company_id
       and (ct.order_id = p_order_id
            or (ct.order_id is null and (ct.description ilike v_desc_pattern
                                         or ct.description ilike '%Order #' || p_order_id::text || '%')))
      where oc.order_id = p_order_id
      group by oc.company_id
    )
    select
      company_id,
      total_debit,
      total_credit,
      greatest(round(total_debit - total_credit, 2), 0.00) as to_credit
    from fb
    where round(total_debit - total_credit, 2) > 0.00;
  END IF;

  --------------------------------------------------------------------
  -- 4) NO deletion of debit rows (per your request)
  --    We keep the original debit(s) and post offsetting credit(s).
  --------------------------------------------------------------------

  --------------------------------------------------------------------
  -- 5) Post reversing CREDIT rows equal to net debits (per company)
  --------------------------------------------------------------------
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

  -- Update available balances
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

  --------------------------------------------------------------------
  -- 6) Detach remaining tx/holds from order to satisfy FKs (keep audit)
  --------------------------------------------------------------------
  update credit_transactions
     set order_id = null
   where order_id = p_order_id
      or (order_id is null and (description ilike v_desc_pattern
                                or description ilike '%Order #' || p_order_id::text || '%'));

  update credit_holds
     set order_id = null
   where order_id = p_order_id;

  --------------------------------------------------------------------
  -- 7) Delete dependents, then the order
  --------------------------------------------------------------------
  delete from order_products_company where order_id = p_order_id;
  delete from order_pre_assignments   where order_id = p_order_id;
  delete from allocation_results      where order_id = p_order_id;
  delete from order_products          where order_id = p_order_id;
  delete from order_company           where order_id = p_order_id;
  delete from orders                  where order_id = p_order_id;
end;
$$;
