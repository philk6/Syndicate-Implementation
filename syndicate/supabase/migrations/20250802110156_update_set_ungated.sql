DROP POLICY IF EXISTS "SET ungated value" ON public.order_products_company;
CREATE POLICY "SET ungated value"
ON public.order_products_company
AS PERMISSIVE
FOR ALL
TO authenticated
USING (company_id = (SELECT company_id FROM users WHERE user_id = auth.uid()))
WITH CHECK (company_id = (SELECT company_id FROM users WHERE user_id = auth.uid()));