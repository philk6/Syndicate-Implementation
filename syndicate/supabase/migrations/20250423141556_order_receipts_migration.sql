CREATE TABLE public.order_receipts (
    receipt_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id INTEGER NOT NULL,
    company_id INTEGER NOT NULL,
    file_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    uploaded_by UUID NOT NULL,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(order_id),
    FOREIGN KEY (company_id) REFERENCES company(company_id),
    FOREIGN KEY (uploaded_by) REFERENCES users(user_id)
);

ALTER TABLE public.order_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins have full access to order_receipts"
ON public.order_receipts
AS PERMISSIVE
FOR ALL
TO authenticated
USING (EXISTS (
    SELECT 1
    FROM users
    WHERE users.user_id = auth.uid() AND users.role = 'admin'::user_role
))
WITH CHECK (EXISTS (
    SELECT 1
    FROM users
    WHERE users.user_id = auth.uid() AND users.role = 'admin'::user_role
));

CREATE POLICY "Users can read own company receipts"
ON public.order_receipts
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (company_id = (
    SELECT company_id
    FROM users
    WHERE user_id = auth.uid()
));

CREATE INDEX order_receipts_order_company_idx ON public.order_receipts (order_id, company_id);