-- Migration generated on 2026-03-12
-- Description: Creates a trigger function that automatically releases held credit
-- when a company's application (order_company row) is deleted by an admin.
-- The existing handle_new_credit_transaction trigger will automatically update
-- the company_credit_summary table when the release transaction is inserted.

-- =============================================
-- Function: fn_handle_credit_release_on_removal
-- =============================================
-- Fires AFTER DELETE on order_company.
-- Looks for an active credit hold for the deleted company+order combo,
-- and if found, creates a release transaction and marks the hold as released.
CREATE OR REPLACE FUNCTION public.fn_handle_credit_release_on_removal()
RETURNS TRIGGER AS $$
DECLARE
    v_hold_record RECORD;
BEGIN
    -- Look for an active hold for this company and order
    SELECT * INTO v_hold_record
    FROM public.credit_holds
    WHERE company_id = OLD.company_id 
      AND order_id = OLD.order_id 
      AND status = 'active'
    LIMIT 1;

    -- If an active hold exists, process the release
    IF FOUND THEN
        -- A. Create the release transaction record.
        -- Amount is POSITIVE to return funds to available_balance.
        -- The existing on_new_credit_transaction trigger on credit_transactions
        -- will automatically update the company_credit_summary table
        -- (adds to available_balance, subtracts from held_balance).
        INSERT INTO public.credit_transactions (
            company_id, 
            amount, 
            transaction_type, 
            description, 
            order_id, 
            created_by
        )
        VALUES (
            OLD.company_id, 
            v_hold_record.amount, -- Positive amount to release back
            'release', 
            'Automatic release due to application removal', 
            OLD.order_id, 
            auth.uid()
        );

        -- B. Update the hold status to released
        UPDATE public.credit_holds
        SET 
            status = 'released', 
            released_at = CURRENT_TIMESTAMP
        WHERE hold_id = v_hold_record.hold_id;
    END IF;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_handle_credit_release_on_removal IS 
    'Trigger function that automatically releases credit holds when a company application is removed from an order.';


-- =============================================
-- Trigger: tr_auto_release_credit
-- =============================================
-- Fires AFTER DELETE on order_company so the credit release
-- happens automatically whenever an admin removes a company's application.
CREATE TRIGGER tr_auto_release_credit
AFTER DELETE ON public.order_company
FOR EACH ROW
EXECUTE FUNCTION public.fn_handle_credit_release_on_removal();
