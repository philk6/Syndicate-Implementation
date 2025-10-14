-- 1) Release + delete in one atomic tx
create or replace function public.admin_release_credit_and_delete_order(
  p_order_id integer,
  p_user_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _hold record;
begin
  -- Lock all active holds for the order
  for _hold in
    select h.hold_id, h.company_id, h.amount
    from credit_holds h
    where h.order_id = p_order_id
      and h.status = 'active'
    for update
  loop
    -- Create release transaction (adds back to available)
    insert into credit_transactions (company_id, amount, transaction_type, description, order_id, created_by)
    values (_hold.company_id, _hold.amount, 'release', 'Auto release on order deletion', p_order_id, p_user_id);

    -- Mark hold as released
    update credit_holds
    set status = 'released', released_at = current_timestamp
    where hold_id = _hold.hold_id;

    -- Move from held -> available
    update company_credit_summary
    set held_balance = held_balance - _hold.amount,
        available_balance = available_balance + _hold.amount,
        last_updated = current_timestamp
    where company_id = _hold.company_id;
  end loop;

  -- Delete dependents (same order as your client code, but server-side + atomic)
  delete from order_products_company where order_id = p_order_id;
  delete from order_pre_assignments   where order_id = p_order_id;
  delete from allocation_results      where order_id = p_order_id;
  delete from order_products          where order_id = p_order_id;
  delete from order_company           where order_id = p_order_id;

  -- Finally, delete the order
  delete from orders where order_id = p_order_id;
end;
$$;

-- Optional: restrict execution to admins via RLS-compatible check
grant execute on function public.admin_release_credit_and_delete_order(integer, uuid) to authenticated;
