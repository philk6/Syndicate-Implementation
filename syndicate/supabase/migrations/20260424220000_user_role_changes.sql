-- ============================================================================
-- Audit log for users.role changes performed via Manage Users.
-- Inserts come exclusively from /api/admin/users/[userId]/role using the
-- service-role client, so no INSERT policy is needed.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_role_changes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
    changed_by  UUID NOT NULL REFERENCES public.users(user_id),
    from_role   TEXT NOT NULL,
    to_role     TEXT NOT NULL,
    metadata    JSONB,
    changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS user_role_changes_user_idx
    ON public.user_role_changes(user_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS user_role_changes_changed_by_idx
    ON public.user_role_changes(changed_by, changed_at DESC);

ALTER TABLE public.user_role_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_role_changes_admin_read ON public.user_role_changes;
CREATE POLICY user_role_changes_admin_read ON public.user_role_changes FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.users WHERE user_id = auth.uid() AND role = 'admin'));

NOTIFY pgrst, 'reload schema';
