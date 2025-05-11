-- Adding tos_accepted column to users table
ALTER TABLE public.users
ADD COLUMN tos_accepted BOOLEAN DEFAULT FALSE NOT NULL;

-- Update RLS policy to allow users to update their own tos_accepted
CREATE POLICY "users_self_update_tos"
ON public.users
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());