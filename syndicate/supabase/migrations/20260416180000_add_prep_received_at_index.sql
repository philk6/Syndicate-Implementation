-- Perf: admin prep dashboard queries on received_at need an index
CREATE INDEX IF NOT EXISTS prep_shipments_received_at_idx
    ON public.prep_shipments (received_at DESC)
    WHERE received_at IS NOT NULL;

NOTIFY pgrst, 'reload schema';
