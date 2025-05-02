-- Add roi and needs_review columns to order_company
ALTER TABLE public.order_company
    ADD COLUMN roi NUMERIC,
    ADD COLUMN needs_review BOOLEAN DEFAULT FALSE;

-- Drop roi and needs_review columns from allocation_results
ALTER TABLE public.allocation_results
    DROP COLUMN roi,
    DROP COLUMN needs_review;