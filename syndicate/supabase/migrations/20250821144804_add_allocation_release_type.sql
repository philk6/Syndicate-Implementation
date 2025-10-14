-- Add new type to enum constraint (requires dropping and re-adding the constraint)
ALTER TABLE public.credit_transactions
DROP CONSTRAINT check_transaction_type;

ALTER TABLE public.credit_transactions
ADD CONSTRAINT check_transaction_type 
CHECK (transaction_type IN ('credit', 'debit', 'hold', 'release', 'allocation', 'allocation_release'));