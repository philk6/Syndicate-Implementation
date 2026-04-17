-- ============================================================================
-- Migration: prep_timestamps_and_storage_rls
-- Description:
--   - Per-status timestamp columns on prep_shipments so the client-side
--     timeline can show exactly when each status was reached.
--   - storage.objects RLS for the 'prep-documents' bucket.
-- ============================================================================

ALTER TABLE public.prep_shipments
    ADD COLUMN submitted_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN in_transit_at          TIMESTAMPTZ,
    ADD COLUMN received_at            TIMESTAMPTZ,
    ADD COLUMN prepping_at            TIMESTAMPTZ,
    ADD COLUMN complete_at            TIMESTAMPTZ,
    ADD COLUMN shipped_to_amazon_at   TIMESTAMPTZ,
    ADD COLUMN cancelled_at           TIMESTAMPTZ;

-- Backfill submitted_at for any rows already in flight
UPDATE public.prep_shipments
   SET submitted_at = created_at
 WHERE submitted_at IS NULL;


-- ============================================================================
-- storage.objects RLS — 'prep-documents' bucket
-- ----------------------------------------------------------------------------
-- Admin (is_chat_admin()) has full access. Writes from client are routed
-- through service-role server actions, so no per-user INSERT policy is
-- required. Authenticated users get SELECT on files whose first path segment
-- is their user_id (defense in depth; signed URLs generated server-side).
-- ============================================================================

CREATE POLICY "prep_docs_admin_all"
    ON storage.objects
    FOR ALL
    TO authenticated
    USING  (bucket_id = 'prep-documents' AND public.is_chat_admin())
    WITH CHECK (bucket_id = 'prep-documents' AND public.is_chat_admin());

CREATE POLICY "prep_docs_user_select_own_folder"
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'prep-documents'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

NOTIFY pgrst, 'reload schema';
