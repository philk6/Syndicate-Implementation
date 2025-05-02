ALTER TABLE public.order_products
ADD COLUMN hide_price_and_quantity BOOLEAN DEFAULT FALSE NOT NULL;

ALTER TABLE public.order_products
ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to update hide_price_and_quantity"
ON public.order_products
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (auth.uid() IN (
    SELECT user_id
    FROM users
    WHERE role = 'admin'::user_role
));