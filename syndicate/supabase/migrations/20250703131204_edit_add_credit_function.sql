-- This function replaces the previous `add_credit` function.
-- It removes the internal auth check and accepts the admin's ID as a parameter.

CREATE OR REPLACE FUNCTION public.add_credit(
    p_company_id INT,
    p_amount NUMERIC(12, 2),
    p_description TEXT,
    p_created_by UUID -- The admin's user_id, passed from the API.
)
RETURNS VOID AS $$
BEGIN
    -- The API route now handles the admin role check.
    -- This function simply records the transaction.

    INSERT INTO public.credit_transactions (
        company_id,
        amount,
        transaction_type,
        description,
        order_id, -- This is NULL for manual credit/debit transactions.
        created_by
    )
    VALUES (
        p_company_id,
        p_amount,
        CASE WHEN p_amount >= 0 THEN 'credit' ELSE 'debit' END,
        p_description,
        NULL,
        p_created_by
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.add_credit(integer, numeric, text, uuid) IS 'Admin function to manually add or remove credit. The calling API is responsible for verifying the user''s admin role.';

-- Grant permission for any authenticated user to call this function.
-- The API route itself is responsible for checking if the user is an admin.
GRANT EXECUTE ON FUNCTION public.add_credit(integer, numeric, text, uuid) TO authenticated;
