-- Migration generated on 2026-03-27
-- Description: Adds the apply_shortfall_adjustments RPC to handle inventory shortfalls
-- post-allocation without reopening the entire order.
--
-- Accepts a JSONB array of adjustments (from calculateShortfallAdjustments server action)
-- and atomically:
--   1. Updates each company's allocation quantity, invested_amount, and profit proportionally
--   2. Inserts a credit_transactions row for each affected company (trigger handles balance updates)
--   3. Updates the order_products quantity to the actual stock level

CREATE OR REPLACE FUNCTION public.apply_shortfall_adjustments(
    p_order_id INT,
    p_sequence INT,
    p_actual_stock INT,
    p_admin_user_id UUID,
    p_adjustments JSONB
)
RETURNS VOID AS $$
DECLARE
    v_admin_role TEXT;
    v_adjustment JSONB;
    v_company_id INT;
    v_new_quantity INT;
    v_units_lost INT;
    v_refund_amount NUMERIC;
    v_old_quantity INT;
    v_old_invested NUMERIC;
    v_old_profit NUMERIC;
    v_asin TEXT;
BEGIN
    -- 1. Verify caller is an admin
    SELECT role::TEXT INTO v_admin_role
    FROM public.users
    WHERE user_id = p_admin_user_id;

    IF v_admin_role IS NULL THEN
        RAISE EXCEPTION 'User not found.';
    END IF;

    IF v_admin_role != 'admin' THEN
        RAISE EXCEPTION 'Permission denied: Only administrators can apply shortfall adjustments.';
    END IF;

    -- 2. Fetch the ASIN for the description
    SELECT asin INTO v_asin
    FROM public.order_products
    WHERE order_id = p_order_id
      AND sequence = p_sequence;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product not found for order_id=% sequence=%.', p_order_id, p_sequence;
    END IF;

    -- 3. Loop through each adjustment in the JSONB array
    FOR v_adjustment IN SELECT * FROM jsonb_array_elements(p_adjustments)
    LOOP
        v_company_id   := (v_adjustment ->> 'company_id')::INT;
        v_new_quantity := (v_adjustment ->> 'new_quantity')::INT;
        v_units_lost   := (v_adjustment ->> 'units_lost')::INT;
        v_refund_amount := (v_adjustment ->> 'refund_amount')::NUMERIC;

        -- Skip companies with no change
        IF v_units_lost = 0 THEN
            CONTINUE;
        END IF;

        -- Fetch current allocation values for proportional reduction
        SELECT quantity, COALESCE(invested_amount, 0), COALESCE(profit, 0)
        INTO v_old_quantity, v_old_invested, v_old_profit
        FROM public.allocation_results
        WHERE order_id = p_order_id
          AND sequence = p_sequence
          AND company_id = v_company_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Allocation not found for order_id=%, sequence=%, company_id=%.',
                p_order_id, p_sequence, v_company_id;
        END IF;

        -- 3a. Update allocation_results with new quantity and proportionally reduced financials
        UPDATE public.allocation_results
        SET quantity = v_new_quantity,
            invested_amount = CASE
                WHEN v_old_quantity > 0
                THEN ROUND(v_old_invested * (v_new_quantity::NUMERIC / v_old_quantity), 2)
                ELSE 0
            END,
            profit = CASE
                WHEN v_old_quantity > 0
                THEN ROUND(v_old_profit * (v_new_quantity::NUMERIC / v_old_quantity), 2)
                ELSE 0
            END
        WHERE order_id = p_order_id
          AND sequence = p_sequence
          AND company_id = v_company_id;

        -- 3b. Insert credit transaction for the refund
        --     The handle_new_credit_transaction trigger will automatically
        --     update company_credit_summary (total_balance + available_balance).
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
            'Inventory shortfall refund for ' || v_asin || ' on Order ' || p_order_id,
            p_order_id,
            p_admin_user_id
        );
    END LOOP;

    -- 4. Update the product quantity to the actual stock level
    UPDATE public.order_products
    SET quantity = p_actual_stock
    WHERE order_id = p_order_id
      AND sequence = p_sequence;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.apply_shortfall_adjustments IS
    'Admin-only RPC to apply inventory shortfall adjustments post-allocation. '
    'Proportionally reduces each company''s allocation quantity, invested_amount, and profit, '
    'issues credit refunds via credit_transactions (trigger auto-updates balances), '
    'and updates order_products.quantity to the actual stock level.';
