-- ============================================================================
-- Migration: add_mission_control_v2_schema
-- Description:
--   Mission Control v2 schema changes. Adds phase/rank catalogs, badges,
--   bonus XP events, per-task XP, and RPCs for task completion + bonus
--   claims. Seed data lives in the next migration.
--
--   Design decisions (agreed with product):
--     - Task is the source of truth for XP (missions.xp_reward stays for
--       legacy admin mission-level grants but is 0 for task-based missions).
--     - Checking a task = instant XP via RPC (SECURITY DEFINER).
--     - Rank tiers replace the quadratic level system (handled in app layer).
--     - user_task_progress keeps its status enum; task_completion writes
--       'approved' directly through the RPC.
-- ============================================================================


-- ============================================================================
-- New catalog tables
-- ============================================================================

CREATE TABLE public.phases (
    id                INTEGER PRIMARY KEY,
    name              TEXT    NOT NULL,
    slug              TEXT    NOT NULL UNIQUE,
    color             TEXT    NOT NULL,
    sort_order        INTEGER NOT NULL,
    always_available  BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE public.ranks (
    id         INTEGER PRIMARY KEY,
    name       TEXT    NOT NULL,
    min_xp     INTEGER NOT NULL,
    color      TEXT    NOT NULL,
    sort_order INTEGER NOT NULL
);

CREATE INDEX ranks_min_xp_idx ON public.ranks (min_xp);


-- ============================================================================
-- Badges — one row per badge earned per user
-- ============================================================================

CREATE TABLE public.user_badges (
    id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    UUID    NOT NULL REFERENCES public.users (user_id)  ON DELETE CASCADE,
    mission_id INTEGER NOT NULL REFERENCES public.missions (id)    ON DELETE CASCADE,
    badge_name TEXT    NOT NULL,
    earned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, mission_id)
);

CREATE INDEX user_badges_user_id_idx ON public.user_badges (user_id);


-- ============================================================================
-- Bonus XP — catalog + ledger
-- ============================================================================

CREATE TABLE public.bonus_xp_events (
    id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    phase_id      INTEGER REFERENCES public.phases (id) ON DELETE SET NULL,
    code          TEXT    NOT NULL UNIQUE,
    description   TEXT    NOT NULL,
    xp_reward     INTEGER NOT NULL,
    is_repeatable BOOLEAN NOT NULL DEFAULT FALSE,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE public.user_bonus_xp (
    id                INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id           UUID    NOT NULL REFERENCES public.users (user_id)        ON DELETE CASCADE,
    bonus_xp_event_id INTEGER NOT NULL REFERENCES public.bonus_xp_events (id)   ON DELETE RESTRICT,
    earned_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata          JSONB
);

CREATE INDEX user_bonus_xp_user_id_idx ON public.user_bonus_xp (user_id);


-- ============================================================================
-- Extend existing tables
-- ============================================================================

ALTER TABLE public.missions
    ADD COLUMN phase_id     INTEGER REFERENCES public.phases (id) ON DELETE SET NULL,
    ADD COLUMN mission_type TEXT NOT NULL DEFAULT 'core'
        CHECK (mission_type IN ('core', 'milestone', 'weekly', 'bonus')),
    ADD COLUMN badge_name   TEXT,
    ADD COLUMN sort_order   INTEGER NOT NULL DEFAULT 0;

CREATE INDEX missions_phase_sort_idx ON public.missions (phase_id, sort_order);

ALTER TABLE public.tasks
    ADD COLUMN xp_reward     INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN auto_complete BOOLEAN NOT NULL DEFAULT TRUE;


-- ============================================================================
-- xp_transactions: expand source enum, add dedup index
-- ============================================================================

ALTER TABLE public.xp_transactions
    DROP CONSTRAINT IF EXISTS xp_transactions_source_check;

ALTER TABLE public.xp_transactions
    ADD CONSTRAINT xp_transactions_source_check
    CHECK (source IN ('task_completion', 'mission_completion', 'manual_adjustment', 'bonus_event'));

-- Prevent double-award for the same (user, task)
CREATE UNIQUE INDEX xp_tx_task_dedup
    ON public.xp_transactions (user_id, reference_id)
    WHERE source = 'task_completion';


-- ============================================================================
-- Read-side views (respect caller's RLS via security_invoker)
-- ============================================================================

CREATE VIEW public.user_total_xp
    WITH (security_invoker = true) AS
SELECT u.user_id,
       COALESCE(SUM(xt.amount), 0)::INTEGER AS total_xp
FROM   public.users u
LEFT JOIN public.xp_transactions xt ON xt.user_id = u.user_id
GROUP BY u.user_id;

CREATE VIEW public.user_rank
    WITH (security_invoker = true) AS
SELECT utx.user_id,
       utx.total_xp,
       r.id    AS rank_id,
       r.name  AS rank_name,
       r.color AS rank_color
FROM public.user_total_xp utx
LEFT JOIN LATERAL (
    SELECT id, name, color
    FROM public.ranks
    WHERE min_xp <= utx.total_xp
    ORDER BY min_xp DESC
    LIMIT 1
) r ON TRUE;


-- ============================================================================
-- RLS on new tables
-- ============================================================================

ALTER TABLE public.phases          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ranks           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_badges     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bonus_xp_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_bonus_xp   ENABLE ROW LEVEL SECURITY;

-- phases: everyone reads, admin writes
CREATE POLICY "phases_read_all"    ON public.phases FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "phases_admin_write" ON public.phases FOR ALL    TO authenticated USING (public.is_chat_admin()) WITH CHECK (public.is_chat_admin());

-- ranks: everyone reads, admin writes
CREATE POLICY "ranks_read_all"    ON public.ranks FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "ranks_admin_write" ON public.ranks FOR ALL    TO authenticated USING (public.is_chat_admin()) WITH CHECK (public.is_chat_admin());

-- user_badges: user reads own, admin all. Writes go through RPC only.
CREATE POLICY "user_badges_user_read" ON public.user_badges FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "user_badges_admin_all" ON public.user_badges FOR ALL    TO authenticated USING (public.is_chat_admin()) WITH CHECK (public.is_chat_admin());

-- bonus_xp_events: everyone reads active, admin all
CREATE POLICY "bonus_events_read_active" ON public.bonus_xp_events FOR SELECT TO authenticated USING (is_active = TRUE);
CREATE POLICY "bonus_events_admin_all"   ON public.bonus_xp_events FOR ALL    TO authenticated USING (public.is_chat_admin()) WITH CHECK (public.is_chat_admin());

-- user_bonus_xp: user reads own, admin all. Writes go through RPC only.
CREATE POLICY "user_bonus_xp_user_read" ON public.user_bonus_xp FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "user_bonus_xp_admin_all" ON public.user_bonus_xp FOR ALL    TO authenticated USING (public.is_chat_admin()) WITH CHECK (public.is_chat_admin());


-- ============================================================================
-- Grants
-- ============================================================================

GRANT SELECT ON public.phases          TO authenticated, service_role;
GRANT SELECT ON public.ranks           TO authenticated, service_role;
GRANT SELECT ON public.user_badges     TO authenticated, service_role;
GRANT SELECT ON public.bonus_xp_events TO authenticated, service_role;
GRANT SELECT ON public.user_bonus_xp   TO authenticated, service_role;

GRANT INSERT, UPDATE, DELETE ON public.phases          TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.ranks           TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.user_badges     TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.bonus_xp_events TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.user_bonus_xp   TO service_role;

GRANT SELECT ON public.user_total_xp TO authenticated, service_role;
GRANT SELECT ON public.user_rank     TO authenticated, service_role;


-- ============================================================================
-- RPC: complete_task — user-callable, instant XP + badge check
-- ============================================================================
CREATE OR REPLACE FUNCTION public.complete_task(p_task_id INTEGER)
RETURNS TABLE(awarded_xp INTEGER, badge_earned TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id          UUID := auth.uid();
    v_task             RECORD;
    v_mission          RECORD;
    v_xp               INTEGER := 0;
    v_badge            TEXT := NULL;
    v_total_tasks      INTEGER;
    v_completed_tasks  INTEGER;
    v_xp_already       BOOLEAN;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT t.* INTO v_task FROM public.tasks t WHERE t.id = p_task_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Task not found: %', p_task_id;
    END IF;

    IF NOT v_task.auto_complete THEN
        RAISE EXCEPTION 'Task requires admin approval';
    END IF;

    SELECT m.* INTO v_mission FROM public.missions m WHERE m.id = v_task.mission_id;
    IF NOT FOUND OR NOT v_mission.is_active THEN
        RAISE EXCEPTION 'Mission not found or inactive';
    END IF;

    IF NOT public.can_see_mission(v_mission.target_audience) THEN
        RAISE EXCEPTION 'User not eligible for this mission';
    END IF;

    -- Upsert progress to approved
    INSERT INTO public.user_task_progress
        (user_id, task_id, status, submitted_at, reviewed_at, reviewed_by)
    VALUES
        (v_user_id, p_task_id, 'approved', NOW(), NOW(), v_user_id)
    ON CONFLICT (user_id, task_id) DO UPDATE
        SET status       = 'approved',
            submitted_at = COALESCE(user_task_progress.submitted_at, NOW()),
            reviewed_at  = NOW(),
            reviewed_by  = v_user_id;

    -- XP ledger (dedup enforced by partial unique index)
    SELECT EXISTS(
        SELECT 1 FROM public.xp_transactions
        WHERE user_id = v_user_id AND source = 'task_completion' AND reference_id = p_task_id
    ) INTO v_xp_already;

    IF NOT v_xp_already AND v_task.xp_reward > 0 THEN
        INSERT INTO public.xp_transactions (user_id, amount, source, reference_id)
        VALUES (v_user_id, v_task.xp_reward, 'task_completion', p_task_id);
        v_xp := v_task.xp_reward;
    END IF;

    -- Badge check: all tasks in mission approved?
    SELECT COUNT(*) INTO v_total_tasks
    FROM public.tasks WHERE mission_id = v_mission.id;

    SELECT COUNT(*) INTO v_completed_tasks
    FROM public.user_task_progress p
    WHERE p.user_id = v_user_id
      AND p.status = 'approved'
      AND p.task_id IN (SELECT id FROM public.tasks WHERE mission_id = v_mission.id);

    IF v_total_tasks > 0
       AND v_completed_tasks = v_total_tasks
       AND v_mission.badge_name IS NOT NULL
    THEN
        INSERT INTO public.user_badges (user_id, mission_id, badge_name)
        VALUES (v_user_id, v_mission.id, v_mission.badge_name)
        ON CONFLICT (user_id, mission_id) DO NOTHING
        RETURNING badge_name INTO v_badge;
    END IF;

    awarded_xp   := v_xp;
    badge_earned := v_badge;
    RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_task(INTEGER) TO authenticated;


-- ============================================================================
-- RPC: uncomplete_task — reverses a self-completed task (user-fix)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.uncomplete_task(p_task_id INTEGER)
RETURNS TABLE(reversed_xp INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_task    RECORD;
    v_xp      INTEGER := 0;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT t.* INTO v_task FROM public.tasks t WHERE t.id = p_task_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Task not found: %', p_task_id;
    END IF;

    DELETE FROM public.user_task_progress
    WHERE user_id = v_user_id AND task_id = p_task_id AND status = 'approved';

    IF NOT FOUND THEN
        reversed_xp := 0;
        RETURN NEXT;
        RETURN;
    END IF;

    DELETE FROM public.xp_transactions
    WHERE user_id = v_user_id
      AND source = 'task_completion'
      AND reference_id = p_task_id;

    IF FOUND THEN
        v_xp := v_task.xp_reward;
    END IF;

    -- Revoke badge if mission is no longer fully complete
    DELETE FROM public.user_badges ub
    WHERE ub.user_id = v_user_id
      AND ub.mission_id = v_task.mission_id
      AND (SELECT COUNT(*) FROM public.tasks WHERE mission_id = v_task.mission_id)
        > (SELECT COUNT(*) FROM public.user_task_progress p
           WHERE p.user_id = v_user_id
             AND p.status = 'approved'
             AND p.task_id IN (SELECT id FROM public.tasks WHERE mission_id = v_task.mission_id));

    reversed_xp := v_xp;
    RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.uncomplete_task(INTEGER) TO authenticated;


-- ============================================================================
-- RPC: claim_bonus_xp — user-callable bonus event claim
-- ============================================================================
CREATE OR REPLACE FUNCTION public.claim_bonus_xp(p_event_code TEXT, p_metadata JSONB DEFAULT NULL)
RETURNS TABLE(awarded_xp INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_event   RECORD;
    v_exists  INTEGER;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT * INTO v_event
    FROM public.bonus_xp_events
    WHERE code = p_event_code AND is_active = TRUE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bonus event not found or inactive: %', p_event_code;
    END IF;

    IF NOT v_event.is_repeatable THEN
        SELECT COUNT(*) INTO v_exists
        FROM public.user_bonus_xp
        WHERE user_id = v_user_id AND bonus_xp_event_id = v_event.id;

        IF v_exists > 0 THEN
            awarded_xp := 0;
            RETURN NEXT;
            RETURN;
        END IF;
    END IF;

    INSERT INTO public.user_bonus_xp (user_id, bonus_xp_event_id, metadata)
    VALUES (v_user_id, v_event.id, p_metadata);

    INSERT INTO public.xp_transactions (user_id, amount, source, reference_id)
    VALUES (v_user_id, v_event.xp_reward, 'bonus_event', v_event.id);

    awarded_xp := v_event.xp_reward;
    RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_bonus_xp(TEXT, JSONB) TO authenticated;


-- ============================================================================
-- RPC: award_bonus_xp — admin-only grant (for verified share-win bonuses etc.)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.award_bonus_xp(p_user_id UUID, p_event_code TEXT, p_metadata JSONB DEFAULT NULL)
RETURNS TABLE(awarded_xp INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_event  RECORD;
    v_exists INTEGER;
BEGIN
    IF NOT public.is_chat_admin() THEN
        RAISE EXCEPTION 'Admin access required';
    END IF;

    SELECT * INTO v_event
    FROM public.bonus_xp_events
    WHERE code = p_event_code AND is_active = TRUE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bonus event not found or inactive: %', p_event_code;
    END IF;

    IF NOT v_event.is_repeatable THEN
        SELECT COUNT(*) INTO v_exists
        FROM public.user_bonus_xp
        WHERE user_id = p_user_id AND bonus_xp_event_id = v_event.id;

        IF v_exists > 0 THEN
            RAISE EXCEPTION 'Bonus already awarded to user';
        END IF;
    END IF;

    INSERT INTO public.user_bonus_xp (user_id, bonus_xp_event_id, metadata)
    VALUES (p_user_id, v_event.id, p_metadata);

    INSERT INTO public.xp_transactions (user_id, amount, source, reference_id)
    VALUES (p_user_id, v_event.xp_reward, 'bonus_event', v_event.id);

    awarded_xp := v_event.xp_reward;
    RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.award_bonus_xp(UUID, TEXT, JSONB) TO authenticated;


-- ============================================================================
-- Reload PostgREST schema cache
-- ============================================================================
NOTIFY pgrst, 'reload schema';
