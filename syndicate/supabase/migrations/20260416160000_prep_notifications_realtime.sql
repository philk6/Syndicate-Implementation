-- ============================================================================
-- Migration: prep_notifications_realtime
-- Description:
--   Ensure prep_notifications is published to the 'supabase_realtime'
--   publication so the client can subscribe for live unread-count updates.
--   Idempotent: wraps the ADD TABLE in a DO block that tolerates
--   "already in publication" state.
-- ============================================================================

DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.prep_notifications;
    EXCEPTION
        WHEN duplicate_object THEN
            -- Already in the publication, nothing to do
            NULL;
    END;
END $$;

NOTIFY pgrst, 'reload schema';
