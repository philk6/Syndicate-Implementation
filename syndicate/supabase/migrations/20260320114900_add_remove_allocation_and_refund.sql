-- Migration generated on 2026-03-20 (updated)
-- Description: Creates the RPC function to remove a single allocation and refund the company's
-- credit balance using TRUE COST RECALCULATION, not the raw invested_amount.
--
-- Why: The Fair Share algorithm can allocate more product value to a company than their
-- max_investment (e.g., $34k of product to a $2k investor). Refunding invested_amount
-- would over-credit. Instead, we recalculate the company's true financial charge based
-- on their REMAINING allocations vs their max_investment, and only refund the difference.

CREATE OR REPLACE FUNCTION public.remove_allocation_and_refund(
    p_allocation_id INT,
    p_admin_user_id UUID
)
RETURNS NUMERIC AS $$
DECLARE
    v_admin_role TEXT;
    v_order_id INT;
    v_sequence INT;
    v_company_id INT;
    v_current_allocated NUMERIC;
    v_max_investment NUMERIC;
    v_remaining_product_value NUMERIC;
    v_new_charge NUMERIC;
    v_refund_amount NUMERIC;
BEGIN
    -- 1. Verify that the caller is an admin
    SELECT role::TEXT INTO v_admin_role
    FROM public.users
    WHERE user_id = p_admin_user_id;

    IF v_admin_role IS NULL THEN
        RAISE EXCEPTION 'User not found.';
    END IF;

    IF v_admin_role != 'admin' THEN
        RAISE EXCEPTION 'Permission denied: Only administrators can revoke allocations.';
    END IF;

    -- 2. Fetch the allocation row (we only need order_id, sequence, company_id)
    SELECT order_id, sequence, company_id
    INTO v_order_id, v_sequence, v_company_id
    FROM public.allocation_results
    WHERE id = p_allocation_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Allocation result with ID % not found.', p_allocation_id;
    END IF;

    -- 3. Fetch the current actual charge and max_investment from order_company
    SELECT COALESCE(allocated_amount, 0), COALESCE(max_investment, 0)
    INTO v_current_allocated, v_max_investment
    FROM public.order_company
    WHERE order_id = v_order_id
      AND company_id = v_company_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No order_company record found for order_id=% and company_id=%.',
            v_order_id, v_company_id;
    END IF;

    -- 4. Sum the invested_amount of all OTHER allocations for this company in this order
    SELECT COALESCE(SUM(invested_amount), 0)
    INTO v_remaining_product_value
    FROM public.allocation_results
    WHERE order_id = v_order_id
      AND company_id = v_company_id
      AND id != p_allocation_id;

    -- 5. The new charge is the lesser of remaining product value and max_investment
    v_new_charge := LEAST(v_remaining_product_value, v_max_investment);

    -- 6. The refund is the difference between the old charge and the new charge
    v_refund_amount := v_current_allocated - v_new_charge;

    -- Ensure refund is never negative (safety guard)
    IF v_refund_amount < 0 THEN
        v_refund_amount := 0;
    END IF;

    -- 7. Delete the allocation row
    DELETE FROM public.allocation_results
    WHERE id = p_allocation_id;

    -- 8. Update order_company with the recalculated charge
    UPDATE public.order_company
    SET allocated_amount = v_new_charge
    WHERE order_id = v_order_id
      AND company_id = v_company_id;

    -- 9. If there is a refund, create a credit transaction.
    --    The trigger `handle_new_credit_transaction` will automatically
    --    update company_credit_summary (total_balance + available_balance).
    IF v_refund_amount > 0 THEN
        INSERT INTO public.credit_transactions (
            company_id,
            amount,
            transaction_type,
            description,
            order_id,
            created_by
        )
        VALUES (
            v_company_id,
            v_refund_amount,
            'credit',
            'Refund: Allocation revoked (Seq ' || v_sequence || '). '
                || 'Order #' || v_order_id || ' charge recalculated: '
                || 'remaining product value $' || ROUND(v_remaining_product_value, 2)
                || ' vs max investment $' || ROUND(v_max_investment, 2)
                || ' → new charge $' || ROUND(v_new_charge, 2)
                || ', refunded $' || ROUND(v_refund_amount, 2) || '.',
            v_order_id,
            p_admin_user_id
        );
    END IF;

    -- 10. Return the actual refunded amount
    RETURN v_refund_amount;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.remove_allocation_and_refund IS
    'Admin-only function to remove a single allocation result and refund the company based on TRUE COST RECALCULATION. '
    'Instead of blindly refunding invested_amount, it recalculates the charge as LEAST(remaining_product_value, max_investment) '
    'and only refunds the difference. The credit_transactions trigger handles updating company_credit_summary automatically.';
