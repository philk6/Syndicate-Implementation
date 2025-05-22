-- First, drop the existing policy if it conflicts or you want to replace it entirely.
-- You might need to adjust the name if it's different in your Supabase project.
DROP POLICY IF EXISTS "Users can view company orders and unassigned orders" ON public.orders;

-- Create the new RLS policy for orders
CREATE POLICY "Users can view public or whitelisted orders"
ON public.orders
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
    orders.is_public = TRUE
    OR EXISTS (
        SELECT 1
        FROM public.order_whitelists ow
        WHERE ow.order_id = orders.order_id
        AND ow.company_id = (SELECT u.company_id FROM public.users u WHERE u.user_id = auth.uid())
    )
);