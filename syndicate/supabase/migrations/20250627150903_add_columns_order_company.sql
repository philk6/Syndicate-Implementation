-- Migration generated on 2025-06-27
-- Description: Modifies the order_company table to support the credit/debit system.

-- =============================================
-- Modify Table: order_company
-- =============================================

-- Step 1: Add new columns to track credit status per order application.
-- These will be NULLABLE as not all historical records will have them.
ALTER TABLE public.order_company
ADD COLUMN IF NOT EXISTS held_amount NUMERIC(12, 2),
ADD COLUMN IF NOT EXISTS allocated_amount NUMERIC(12, 2);

-- Add comments for clarity
COMMENT ON COLUMN public.order_company.held_amount IS 'The amount of credit held when the company first applies for this order.';
COMMENT ON COLUMN public.order_company.allocated_amount IS 'The final amount of credit deducted from the company balance after order calculation.';

-- Note: The CHECK constraint will be added in a subsequent migration
-- after the company_credit_summary table has been populated with initial balances.
-- Adding it now would cause an error on existing data.

-- We can, however, still create the helper function as it will be needed later.
CREATE OR REPLACE FUNCTION public.get_available_balance(p_company_id integer)
RETURNS numeric AS $$
DECLARE
    balance numeric;
BEGIN
    SELECT available_balance INTO balance
    FROM public.company_credit_summary
    WHERE company_id = p_company_id;
    RETURN COALESCE(balance, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
