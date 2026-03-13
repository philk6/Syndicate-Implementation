-- ============================================================================
-- Migration: Fix self-referencing RLS recursion on public.users
-- Created:   2026-03-13
-- Description:
--   The users_admin_all policy queried public.users from within a policy on
--   public.users, causing infinite RLS recursion. This broke ALL reads on the
--   users table (no user could see their own name, role, etc.).
--
--   Fix: Use the existing SECURITY DEFINER function is_chat_admin() which
--   bypasses RLS when checking admin status.
-- ============================================================================

-- Drop the broken policy
DROP POLICY IF EXISTS "users_admin_all" ON public.users;

-- Recreate using the SECURITY DEFINER function (bypasses RLS on the inner query)
CREATE POLICY "users_admin_all"
    ON public.users
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING  (public.is_chat_admin())
    WITH CHECK (public.is_chat_admin());
