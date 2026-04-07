-- ============================================================================
-- Migration: add_missions_xp_rls_policies
-- Created:   2026-04-03
-- Description:
--   RLS policies for the Mission & XP system tables:
--     missions, tasks, user_task_progress, xp_transactions
--
--   Admin check reuses the existing SECURITY DEFINER function
--   public.is_chat_admin() to avoid RLS recursion on public.users.
--
--   A new SECURITY DEFINER helper, can_see_mission(), encapsulates the
--   audience-matching logic for missions (and tasks by extension).
-- ============================================================================


-- ============================================================================
-- Helper: can the current user see a mission with a given target_audience?
--   - 'all'          → any authenticated user
--   - '1on1'         → user.has_1on1_membership = TRUE
--   - 'buyersgroup'  → user.buyersgroup = TRUE
-- SECURITY DEFINER so it can read public.users without triggering RLS.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.can_see_mission(p_target_audience VARCHAR)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT CASE p_target_audience
        WHEN 'all' THEN TRUE
        WHEN '1on1' THEN (
            SELECT COALESCE(u.has_1on1_membership, FALSE)
            FROM public.users u
            WHERE u.user_id = auth.uid()
        )
        WHEN 'buyersgroup' THEN (
            SELECT COALESCE(u.buyersgroup, FALSE)
            FROM public.users u
            WHERE u.user_id = auth.uid()
        )
        ELSE FALSE
    END;
$$;


-- ============================================================================
-- MISSIONS policies
-- ============================================================================

-- Admins: full CRUD
CREATE POLICY "missions_admin_all"
    ON public.missions
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING  (public.is_chat_admin())
    WITH CHECK (public.is_chat_admin());

-- Users: read active missions whose target_audience matches their membership
CREATE POLICY "missions_user_select"
    ON public.missions
    AS PERMISSIVE
    FOR SELECT
    TO authenticated
    USING (
        is_active = TRUE
        AND public.can_see_mission(target_audience)
    );


-- ============================================================================
-- TASKS policies
-- ============================================================================

-- Admins: full CRUD
CREATE POLICY "tasks_admin_all"
    ON public.tasks
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING  (public.is_chat_admin())
    WITH CHECK (public.is_chat_admin());

-- Users: read tasks for missions they can see
CREATE POLICY "tasks_user_select"
    ON public.tasks
    AS PERMISSIVE
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.missions m
            WHERE m.id = tasks.mission_id
              AND m.is_active = TRUE
              AND public.can_see_mission(m.target_audience)
        )
    );


-- ============================================================================
-- USER_TASK_PROGRESS policies
-- ============================================================================

-- Admins: full CRUD (needed to approve/reject submissions)
CREATE POLICY "user_task_progress_admin_all"
    ON public.user_task_progress
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING  (public.is_chat_admin())
    WITH CHECK (public.is_chat_admin());

-- Users: read own progress rows
CREATE POLICY "user_task_progress_user_select"
    ON public.user_task_progress
    AS PERMISSIVE
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Users: insert own progress rows (status must start as 'pending' or 'submitted')
CREATE POLICY "user_task_progress_user_insert"
    ON public.user_task_progress
    AS PERMISSIVE
    FOR INSERT
    TO authenticated
    WITH CHECK (
        user_id = auth.uid()
        AND status IN ('pending', 'submitted')
    );

-- Users: update own progress rows, but cannot set status to 'approved'
--   (they can submit proof → status = 'submitted', or re-submit after rejection)
CREATE POLICY "user_task_progress_user_update"
    ON public.user_task_progress
    AS PERMISSIVE
    FOR UPDATE
    TO authenticated
    USING  (user_id = auth.uid())
    WITH CHECK (
        user_id = auth.uid()
        AND status IN ('pending', 'submitted')
    );


-- ============================================================================
-- XP_TRANSACTIONS policies
-- ============================================================================

-- Admins: full CRUD (manual adjustments, awarding XP)
CREATE POLICY "xp_transactions_admin_all"
    ON public.xp_transactions
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING  (public.is_chat_admin())
    WITH CHECK (public.is_chat_admin());

-- Users: read own XP history only
CREATE POLICY "xp_transactions_user_select"
    ON public.xp_transactions
    AS PERMISSIVE
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());


-- ============================================================================
-- GRANTS — allow authenticated & service_role to interact with new tables
-- ============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.missions           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.missions           TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks              TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks              TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_task_progress TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_task_progress TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.xp_transactions    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.xp_transactions    TO service_role;


-- ============================================================================
-- Reload PostgREST schema cache
-- ============================================================================
NOTIFY pgrst, 'reload schema';
