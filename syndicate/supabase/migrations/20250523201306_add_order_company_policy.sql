-- Policy to allow admins to UPDATE any record in order_company
-- This is crucial for the Admin Order Management page functionality.
DROP POLICY IF EXISTS "Admins can update all order_company records" ON public.order_company;
CREATE POLICY "Admins can update all order_company records"
ON public.order_company
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (EXISTS (SELECT 1 FROM users WHERE users.user_id = auth.uid() AND users.role = 'admin'::user_role));

-- You might also want to ensure admins can INSERT and DELETE as well, if they don't already have policies for that.
-- For example, if you want full admin control:
DROP POLICY IF EXISTS "Admins can manage all order_company records" ON public.order_company;
CREATE POLICY "Admins can manage all order_company records"
ON public.order_company
AS PERMISSIVE
FOR ALL -- This covers SELECT, INSERT, UPDATE, DELETE
TO authenticated
USING (EXISTS (SELECT 1 FROM users WHERE users.user_id = auth.uid() AND users.role = 'admin'::user_role))
WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.user_id = auth.uid() AND users.role = 'admin'::user_role));