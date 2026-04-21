-- ============================================================================
-- Seed the order_statuses table with the canonical list used across the app.
-- Idempotent via ON CONFLICT DO NOTHING on description (unique-by-description
-- is enforced at application level; description is not a natural unique key
-- in the original schema, so we guard with NOT EXISTS).
-- ============================================================================

DO $$
BEGIN
    INSERT INTO public.order_statuses (description)
    SELECT v.description
    FROM (VALUES
        ('Draft'),
        ('Active'),
        ('Closed'),
        ('Fulfilled'),
        ('Cancelled')
    ) AS v(description)
    WHERE NOT EXISTS (
        SELECT 1 FROM public.order_statuses s
        WHERE s.description = v.description
    );
END $$;

NOTIFY pgrst, 'reload schema';
