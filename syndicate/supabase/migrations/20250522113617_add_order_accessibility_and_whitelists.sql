-- Migration 1: Add is_public column to orders table
ALTER TABLE public.orders
ADD COLUMN is_public BOOLEAN DEFAULT TRUE NOT NULL;

-- Migration 2: Create order_whitelists table
CREATE TABLE public.order_whitelists (
    order_id INTEGER NOT NULL,
    company_id INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (order_id, company_id),
    FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
    FOREIGN KEY (company_id) REFERENCES company(company_id) ON DELETE CASCADE
);

-- Migration 3: Add RLS policies for order_whitelists
ALTER TABLE public.order_whitelists ENABLE ROW LEVEL SECURITY;

-- Policy for admins to manage whitelists (full access)
CREATE POLICY "Admins can manage order whitelists"
ON public.order_whitelists
AS PERMISSIVE
FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM users WHERE users.user_id = auth.uid() AND users.role = 'admin'::user_role))
WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.user_id = auth.uid() AND users.role = 'admin'::user_role));

-- Policy for whitelisted companies to read their entries (for user-facing logic)
-- This policy allows users to read entries in order_whitelists only if their company_id matches.
-- This is crucial for filtering orders on the user-facing side.
CREATE POLICY "Whitelisted companies can read their entries"
ON public.order_whitelists
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (company_id = (SELECT company_id FROM users WHERE user_id = auth.uid()));