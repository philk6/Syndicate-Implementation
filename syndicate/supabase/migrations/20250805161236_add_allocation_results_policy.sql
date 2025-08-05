-- Policy for users to view their own company's allocation results
CREATE POLICY "Users can view own allocation results"
ON "public"."allocation_results"
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
  company_id = (
    SELECT company_id
    FROM users
    WHERE user_id = auth.uid()
  )
);

-- Policy for admins to have full access to allocation results
CREATE POLICY "Admins have full access to allocation_results"
ON "public"."allocation_results"
AS PERMISSIVE
FOR ALL
TO authenticated
USING (
  (
    SELECT role
    FROM users
    WHERE user_id = auth.uid()
  ) = 'admin'::user_role
)
WITH CHECK (
  (
    SELECT role
    FROM users
    WHERE user_id = auth.uid()
  ) = 'admin'::user_role
);