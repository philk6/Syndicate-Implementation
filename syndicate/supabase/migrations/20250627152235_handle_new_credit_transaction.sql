-- Migration generated on 2025-06-27
-- Description: Creates the functions and triggers for the credit system backend logic.

-- =============================================
-- Section 1: Core Functions
-- =============================================

-- Function to safely add or remove credit for a company.
-- This is intended to be called by an admin.
CREATE OR REPLACE FUNCTION public.add_credit(
    p_company_id INT,
    p_amount NUMERIC(12, 2),
    p_description TEXT
)
RETURNS VOID AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_user_role TEXT;
BEGIN
    -- Ensure the calling user is an admin
    SELECT role INTO v_user_role FROM public.users WHERE user_id = v_user_id;
    IF v_user_role != 'admin' THEN
        RAISE EXCEPTION 'Only administrators can add or remove credit.';
    END IF;

    -- A positive amount is a credit, a negative amount is a debit.
    INSERT INTO public.credit_transactions (
        company_id,
        amount,
        transaction_type,
        description,
        order_id,
        created_by
    )
    VALUES (
        p_company_id,
        p_amount,
        CASE WHEN p_amount >= 0 THEN 'credit' ELSE 'debit' END,
        p_description,
        NULL, -- Manual transaction, not tied to an order
        v_user_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
COMMENT ON FUNCTION public.add_credit IS 'Admin function to manually add (positive amount) or remove (negative amount) credit from a company account.';


-- Function to process a credit hold when a company applies for an order.
CREATE OR REPLACE FUNCTION public.process_order_hold(
    p_company_id INT,
    p_order_id INT,
    p_hold_amount NUMERIC(12, 2)
)
RETURNS BOOLEAN AS $$
DECLARE
    v_available_balance NUMERIC;
    v_user_id UUID := auth.uid();
BEGIN
    -- Check available balance first
    SELECT available_balance INTO v_available_balance
    FROM public.company_credit_summary
    WHERE company_id = p_company_id;

    IF v_available_balance IS NULL OR v_available_balance < p_hold_amount THEN
        RAISE EXCEPTION 'Insufficient available credit. Required: %, Available: %', p_hold_amount, COALESCE(v_available_balance, 0);
        RETURN FALSE;
    END IF;

    -- Create the hold record
    INSERT INTO public.credit_holds (company_id, order_id, amount, status)
    VALUES (p_company_id, p_order_id, p_hold_amount, 'active')
    ON CONFLICT (company_id, order_id) WHERE (status = 'active')
    DO UPDATE SET amount = p_hold_amount;

    -- Create the 'hold' transaction which will trigger the balance update
    INSERT INTO public.credit_transactions(company_id, amount, transaction_type, description, order_id, created_by)
    VALUES (p_company_id, p_hold_amount * -1, 'hold', 'Credit hold for order application.', p_order_id, v_user_id);

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
COMMENT ON FUNCTION public.process_order_hold IS 'Places an active hold on a company''s credit when they apply for an order.';


-- =============================================
-- Section 2: Trigger and Trigger Function
-- =============================================

-- This is the core logic. This function will automatically update the summary table
-- every time a new transaction is inserted.
CREATE OR REPLACE FUNCTION public.handle_new_credit_transaction()
RETURNS TRIGGER AS $$
DECLARE
    v_company_id INT;
    v_amount NUMERIC;
    v_transaction_type TEXT;
BEGIN
    -- Get values from the new transaction record
    v_company_id := NEW.company_id;
    v_amount := NEW.amount;
    v_transaction_type := NEW.transaction_type;

    -- Lock the summary row to prevent race conditions
    PERFORM * FROM public.company_credit_summary WHERE company_id = v_company_id FOR UPDATE;

    -- Update balances based on transaction type
    IF v_transaction_type = 'credit' OR v_transaction_type = 'debit' THEN
        UPDATE public.company_credit_summary
        SET
            total_balance = total_balance + v_amount,
            available_balance = available_balance + v_amount,
            last_updated = NOW()
        WHERE company_id = v_company_id;

    ELSIF v_transaction_type = 'hold' THEN
        -- Note: v_amount for a hold transaction is negative
        UPDATE public.company_credit_summary
        SET
            available_balance = available_balance + v_amount, -- Subtracts the hold amount
            held_balance = held_balance - v_amount, -- Adds the hold amount
            last_updated = NOW()
        WHERE company_id = v_company_id;

    ELSIF v_transaction_type = 'release' THEN
        -- Note: v_amount for a release transaction is positive
        UPDATE public.company_credit_summary
        SET
            available_balance = available_balance + v_amount, -- Adds back to available
            held_balance = held_balance - v_amount, -- Subtracts from held
            last_updated = NOW()
        WHERE company_id = v_company_id;

    ELSIF v_transaction_type = 'allocation' THEN
        -- Note: v_amount for an allocation transaction is negative
        UPDATE public.company_credit_summary
        SET
            total_balance = total_balance + v_amount, -- Permanently subtracts from total
            held_balance = held_balance + v_amount, -- Removes from held
            last_updated = NOW()
        WHERE company_id = v_company_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
COMMENT ON FUNCTION public.handle_new_credit_transaction IS 'Trigger function to automatically update the company_credit_summary table upon any new transaction.';


-- Finally, create the trigger that calls the function after every insert.
CREATE TRIGGER on_new_credit_transaction
AFTER INSERT ON public.credit_transactions
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_credit_transaction();

