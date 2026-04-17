-- ============================================================================
-- Migration: add_mission_media
-- Description:
--   Admin-uploaded media (videos, images, documents) attached to missions.
--   Shown to users as "Training Resources" on each mission card.
-- ============================================================================

CREATE TABLE public.mission_media (
    id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    mission_id    INTEGER NOT NULL REFERENCES public.missions (id) ON DELETE CASCADE,
    title         TEXT    NOT NULL,
    media_type    TEXT    NOT NULL CHECK (media_type IN ('video', 'image', 'document')),
    url           TEXT    NOT NULL,
    thumbnail_url TEXT,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX mission_media_mission_sort_idx
    ON public.mission_media (mission_id, sort_order);


-- ============================================================================
-- RLS — read for all authenticated, write admin-only
-- ============================================================================
ALTER TABLE public.mission_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mission_media_read_all"
    ON public.mission_media
    FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "mission_media_admin_all"
    ON public.mission_media
    FOR ALL
    TO authenticated
    USING  (public.is_chat_admin())
    WITH CHECK (public.is_chat_admin());

GRANT SELECT                         ON public.mission_media TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_media TO service_role;


NOTIFY pgrst, 'reload schema';
