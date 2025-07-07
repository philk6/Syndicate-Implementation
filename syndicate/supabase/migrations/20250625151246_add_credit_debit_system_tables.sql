-- Migration generated on 2025-06-25
-- Description: Creates the initial tables for the credit/debit system.

-- =============================================
-- Table: credit_transactions
-- =============================================
-- Stores all credit and debit movements for each company.
CREATE TABLE public.credit_transactions (
    transaction_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES public.company(company_id),
    amount NUMERIC(12, 2) NOT NULL, -- Positive for credits, negative for debits
    transaction_type VARCHAR(20) NOT NULL, -- 'credit', 'debit', 'hold', 'release', 'allocation'
    description TEXT,
    order_id INTEGER REFERENCES public.orders(order_id), -- Can be NULL for manual admin transactions
    created_by UUID NOT NULL REFERENCES public.users(user_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_transaction_type CHECK (transaction_type IN ('credit', 'debit', 'hold', 'release', 'allocation'))
);

-- Add comments for clarity
COMMENT ON TABLE public.credit_transactions IS 'Logs all credit and debit transactions for companies.';
COMMENT ON COLUMN public.credit_transactions.amount IS 'The amount of the transaction. Positive for additions, negative for deductions.';
COMMENT ON COLUMN public.credit_transactions.transaction_type IS 'Categorizes the transaction type (e.g., manual credit, order hold).';
COMMENT ON COLUMN public.credit_transactions.order_id IS 'Links the transaction to a specific order if applicable.';

-- Enable Row-Level Security
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for credit_transactions
CREATE POLICY "Admins have full access to credit_transactions"
ON public.credit_transactions
AS PERMISSIVE FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM users
        WHERE users.user_id = auth.uid() AND users.role = 'admin'::user_role
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM users
        WHERE users.user_id = auth.uid() AND users.role = 'admin'::user_role
    )
);

CREATE POLICY "Users can view their own company's credit transactions"
ON public.credit_transactions
AS PERMISSIVE FOR SELECT
TO authenticated
USING (
    company_id = (
        SELECT u.company_id FROM users u WHERE u.user_id = auth.uid()
    )
);


-- =============================================
-- Table: company_credit_summary
-- =============================================
-- A summary table for quick lookups of a company's credit balance.
CREATE TABLE public.company_credit_summary (
    company_id INTEGER PRIMARY KEY REFERENCES public.company(company_id) ON DELETE CASCADE,
    total_balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
    available_balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
    held_balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_balances_consistency CHECK (
        total_balance = available_balance + held_balance AND
        available_balance >= 0 AND
        held_balance >= 0
    )
);

-- Add comments for clarity
COMMENT ON TABLE public.company_credit_summary IS 'Materialized view pattern to store current credit balances for companies.';
COMMENT ON COLUMN public.company_credit_summary.total_balance IS 'The total credit a company has (available + held).';
COMMENT ON COLUMN public.company_credit_summary.available_balance IS 'The portion of the total balance available for new investments.';
COMMENT ON COLUMN public.company_credit_summary.held_balance IS 'The portion of the total balance currently on hold for active order applications.';

-- Enable Row-Level Security
ALTER TABLE public.company_credit_summary ENABLE ROW LEVEL SECURITY;

-- RLS Policies for company_credit_summary
CREATE POLICY "Admins have full access to company_credit_summary"
ON public.company_credit_summary
AS PERMISSIVE FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM users
        WHERE users.user_id = auth.uid() AND users.role = 'admin'::user_role
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM users
        WHERE users.user_id = auth.uid() AND users.role = 'admin'::user_role
    )
);

CREATE POLICY "Users can view their own company's credit summary"
ON public.company_credit_summary
AS PERMISSIVE FOR SELECT
TO authenticated
USING (
    company_id = (
        SELECT u.company_id FROM users u WHERE u.user_id = auth.uid()
    )
);


-- =============================================
-- Table: credit_holds
-- =============================================
-- Tracks funds that are temporarily reserved for order applications.
CREATE TABLE public.credit_holds (
    hold_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES public.company(company_id),
    order_id INTEGER NOT NULL REFERENCES public.orders(order_id),
    amount NUMERIC(12, 2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active', -- 'active', 'released', 'allocated'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    released_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT check_hold_status CHECK (status IN ('active', 'released', 'allocated'))
);

-- A company can only have one *active* hold per order.
CREATE UNIQUE INDEX credit_holds_unique_active_hold_per_order
ON public.credit_holds (company_id, order_id)
WHERE (status = 'active');

-- Add comments for clarity
COMMENT ON TABLE public.credit_holds IS 'Tracks credit actively held for companies that have applied to orders.';
COMMENT ON COLUMN public.credit_holds.status IS 'The current state of the hold (active, released, or converted to an allocation).';

-- Enable Row-Level Security
ALTER TABLE public.credit_holds ENABLE ROW LEVEL SECURITY;

-- RLS Policies for credit_holds
CREATE POLICY "Admins have full access to credit_holds"
ON public.credit_holds
AS PERMISSIVE FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM users
        WHERE users.user_id = auth.uid() AND users.role = 'admin'::user_role
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM users
        WHERE users.user_id = auth.uid() AND users.role = 'admin'::user_role
    )
);

CREATE POLICY "Users can view their own company's credit holds"
ON public.credit_holds
AS PERMISSIVE FOR SELECT
TO authenticated
USING (
    company_id = (
        SELECT u.company_id FROM users u WHERE u.user_id = auth.uid()
    )
);
