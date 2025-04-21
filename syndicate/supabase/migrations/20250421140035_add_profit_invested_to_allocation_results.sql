-- Add profit and invested_amount columns to allocation_results
ALTER TABLE public.allocation_results
    ADD COLUMN profit NUMERIC,
    ADD COLUMN invested_amount NUMERIC;

-- Add index on created_at for time-based queries
CREATE INDEX idx_allocation_results_created_at ON public.allocation_results (created_at);