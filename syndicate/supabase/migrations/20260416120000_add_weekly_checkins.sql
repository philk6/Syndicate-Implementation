-- ============================================================================
-- Migration: add_weekly_checkins
-- Description:
--   Per-user weekly reflection record. One row per (user, week_start).
--   Paired with the existing `phaseN_weekly_checkin` rows in
--   bonus_xp_events, which grant +50 XP on submission via claim_bonus_xp.
--
--   week_start = Monday of the ISO week the check-in covers.
-- ============================================================================

CREATE TABLE public.weekly_checkins (
    id                   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id              UUID    NOT NULL REFERENCES public.users (user_id)   ON DELETE CASCADE,
    company_id           INTEGER          REFERENCES public.company (company_id) ON DELETE SET NULL,
    week_start           DATE    NOT NULL,
    accomplished         TEXT    NOT NULL,
    next_week_goal       TEXT    NOT NULL,
    suppliers_contacted  INTEGER NOT NULL DEFAULT 0 CHECK (suppliers_contacted >= 0),
    calls_made           INTEGER NOT NULL DEFAULT 0 CHECK (calls_made >= 0),
    submitted_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, week_start)
);

CREATE INDEX weekly_checkins_week_start_idx ON public.weekly_checkins (week_start);
CREATE INDEX weekly_checkins_user_week_idx  ON public.weekly_checkins (user_id, week_start);


-- ============================================================================
-- RLS
-- ============================================================================
ALTER TABLE public.weekly_checkins ENABLE ROW LEVEL SECURITY;

-- Users insert + read own rows
CREATE POLICY "weekly_checkins_user_select"
    ON public.weekly_checkins
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "weekly_checkins_user_insert"
    ON public.weekly_checkins
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

-- Admins full CRUD (read all check-ins for dashboard)
CREATE POLICY "weekly_checkins_admin_all"
    ON public.weekly_checkins
    FOR ALL TO authenticated
    USING  (public.is_chat_admin())
    WITH CHECK (public.is_chat_admin());


-- ============================================================================
-- Grants
-- ============================================================================
GRANT SELECT, INSERT ON public.weekly_checkins TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_checkins TO service_role;


NOTIFY pgrst, 'reload schema';
