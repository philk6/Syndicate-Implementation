-- Migration generated on 2026-03-20
-- Description: Creates the RPC function to remove a single allocation and refund the company's credit balance.
-- This avoids a full order recalculation when an admin needs to revoke one allocation on a closed order.

CREATE OR REPLACE FUNCTION public.remove_allocation_and_refund(
    p_allocation_id INT,
    p_admin_user_id UUID
)
RETURNS VOID AS $$
DECLARE
    v_admin_role TEXT;
    v_order_id INT;
    v_sequence INT;
    v_company_id INT;
    v_invested_amount NUMERIC;
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

    -- 2. Fetch the allocation row
    SELECT order_id, sequence, company_id, invested_amount
    INTO v_order_id, v_sequence, v_company_id, v_invested_amount
    FROM public.allocation_results
    WHERE id = p_allocation_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Allocation result with ID % not found.', p_allocation_id;
    END IF;

    IF v_invested_amount IS NULL OR v_invested_amount <= 0 THEN
        RAISE EXCEPTION 'Allocation has no invested amount to refund (invested_amount: %).', COALESCE(v_invested_amount, 0);
    END IF;

    -- 3. Delete the allocation row
    DELETE FROM public.allocation_results
    WHERE id = p_allocation_id;

    -- 4. Subtract the invested amount from order_company.allocated_amount
    UPDATE public.order_company
    SET allocated_amount = COALESCE(allocated_amount, 0) - v_invested_amount
    WHERE order_id = v_order_id
      AND company_id = v_company_id;

    -- 5. Insert a credit transaction for the refund.
    --    The trigger `handle_new_credit_transaction` will automatically
    --    update company_credit_summary (total_balance + available_balance).
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
        v_invested_amount,
        'credit',
        'Refund: Allocation revoked by admin due to gating/error in Order #' || v_order_id || ' for Sequence ' || v_sequence,
        v_order_id,
        p_admin_user_id
    );

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.remove_allocation_and_refund IS 'Admin-only function to remove a single allocation result and refund the invested amount back to the company credit balance. The credit_transactions trigger handles updating company_credit_summary automatically.';
