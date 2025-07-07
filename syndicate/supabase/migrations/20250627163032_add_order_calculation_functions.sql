-- Migration generated on 2025-06-27
-- Description: Creates functions for processing and resetting credits during order calculation.

-- =============================================
-- Function 1: process_order_finalization
-- =============================================
-- This is the main function called after the allocation algorithm runs.
-- It resets all previous credit movements for the order and applies the new, final ones based on the latest allocation_results.
CREATE OR REPLACE FUNCTION public.process_order_finalization(p_order_id INT)
RETURNS TEXT AS $$
DECLARE
    company_rec RECORD;
    v_newly_allocated_value NUMERIC;
    v_hold_amount NUMERIC;
    v_release_amount NUMERIC;
    v_user_id UUID := auth.uid();
BEGIN
    -- STEP 1: RESET ALL PREVIOUS CREDIT STATE FOR THIS ORDER.
    -- Reverse any previous 'hold' or 'allocation' transactions to make the operation idempotent.
    PERFORM public.release_all_credits_for_order(p_order_id);

    -- STEP 2: PROCESS FINAL ALLOCATIONS FOR EACH COMPANY WITH AN APPLICATION.
    FOR company_rec IN
        SELECT oc.company_id, oc.max_investment
        FROM public.order_company oc
        WHERE oc.order_id = p_order_id
    LOOP
        -- Determine the total value of products newly allocated to this company.
        SELECT COALESCE(SUM(ar.quantity * op.price), 0)
        INTO v_newly_allocated_value
        FROM public.allocation_results ar
        JOIN public.order_products op ON ar.order_id = op.order_id AND ar.sequence = op.sequence
        WHERE ar.order_id = p_order_id AND ar.company_id = company_rec.company_id;

        -- The amount to hold is their max investment.
        v_hold_amount := company_rec.max_investment;

        -- Place a fresh hold. This will fail if they no longer have sufficient funds.
        PERFORM public.process_order_hold(company_rec.company_id, p_order_id, v_hold_amount);
        
        -- Update order_company with the held amount.
        UPDATE public.order_company SET held_amount = v_hold_amount
        WHERE order_id = p_order_id AND company_id = company_rec.company_id;

        -- Calculate the difference to be released.
        v_release_amount := v_hold_amount - v_newly_allocated_value;

        -- If the final allocation is less than the hold, release the difference.
        IF v_release_amount > 0 THEN
            INSERT INTO public.credit_transactions(company_id, amount, transaction_type, description, order_id, created_by)
            VALUES (company_rec.company_id, v_release_amount, 'release', 'Release of unused hold for order ' || p_order_id, p_order_id, v_user_id);
        END IF;

        -- Create the final, permanent 'allocation' transaction for the value of the goods.
        IF v_newly_allocated_value > 0 THEN
            INSERT INTO public.credit_transactions(company_id, amount, transaction_type, description, order_id, created_by)
            VALUES (company_rec.company_id, v_newly_allocated_value * -1, 'allocation', 'Final allocation for order ' || p_order_id, p_order_id, v_user_id);
        END IF;

        -- Update the hold status to 'allocated'.
        UPDATE public.credit_holds SET status = 'allocated', released_at = NOW()
        WHERE order_id = p_order_id AND company_id = company_rec.company_id AND status = 'active';
        
        -- Update order_company with the final allocated amount.
        UPDATE public.order_company SET allocated_amount = v_newly_allocated_value
        WHERE order_id = p_order_id AND company_id = company_rec.company_id;

    END LOOP;

    RETURN 'Order finalization and credit processing complete.';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =============================================
-- Function 2: release_all_credits_for_order
-- =============================================
-- A helper function to safely reverse all credit movements for a given order.
-- This iterates through all companies with a credit footprint on the order and calls the specific release function for each.
CREATE OR REPLACE FUNCTION public.release_all_credits_for_order(p_order_id INT)
RETURNS VOID AS $$
DECLARE
    company_rec RECORD;
BEGIN
   -- Find each unique company with a credit hold or transaction for this order.
   FOR company_rec IN
        SELECT DISTINCT company_id
        FROM (
            SELECT company_id FROM public.credit_transactions WHERE order_id = p_order_id
            UNION
            SELECT company_id FROM public.credit_holds WHERE order_id = p_order_id
        ) as companies_with_credits
    LOOP
        -- Call the more specific function for each company found.
        PERFORM public.release_credits_for_application(p_order_id, company_rec.company_id);
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =============================================
-- Function 3: release_credits_for_application
-- =============================================
-- Safely reverses all credit movements for a SINGLE company on a SINGLE order.
-- This is ideal for when an admin deletes one specific application or for recalculations.
CREATE OR REPLACE FUNCTION public.release_credits_for_application(p_order_id INT, p_company_id INT)
RETURNS VOID AS $$
DECLARE
    rec RECORD;
    v_user_id UUID := auth.uid();
BEGIN
    -- Find all 'hold' or 'allocation' transactions for this specific application.
    FOR rec IN
        SELECT amount, transaction_type
        FROM public.credit_transactions
        WHERE order_id = p_order_id 
          AND company_id = p_company_id
          AND (transaction_type = 'hold' OR transaction_type = 'allocation')
    LOOP
        -- Create a 'release' transaction with the opposite amount to reverse the effect.
        INSERT INTO public.credit_transactions(company_id, amount, transaction_type, description, order_id, created_by)
        VALUES (p_company_id, rec.amount * -1, 'release', 'Release for order recalculation or application deletion. Order ID: ' || p_order_id, p_order_id, v_user_id);
    END LOOP;

    -- Mark all hold records for this application as 'released'.
    UPDATE public.credit_holds SET status = 'released', released_at = NOW()
    WHERE order_id = p_order_id 
      AND company_id = p_company_id 
      AND status IN ('active', 'allocated');
    
    -- Clear out the amounts in the order_company table for this specific application.
    UPDATE public.order_company SET held_amount = NULL, allocated_amount = NULL
    WHERE order_id = p_order_id AND company_id = p_company_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
