-- ============================================================================
-- Migration: Fix Admin RLS, Chat Visibility, Student Default, Credit Init
-- Created:   2026-03-13
-- Description:
--   1. Add RLS policy so admins can UPDATE any user row (fixes platform_role
--      and has_1on1_membership changes for other users).
--   2. Add RLS policy so admins can SELECT all user rows (needed for the
--      admin manage-users table and chat mentor search).
--   3. Change platform_role default from 'none' to 'student' so new signups
--      are automatically students.
--   4. Create trigger on company INSERT to auto-create a $0 credit summary.
-- ============================================================================


-- ============================================================================
-- 1. ADMIN UPDATE POLICY ON public.users
--    Currently only users_self_update exists (user_id = auth.uid()).
--    Admins need to update platform_role, has_1on1_membership,
--    membership_end_date for any user.
-- ============================================================================

-- Drop first in case it already exists (idempotent)
DROP POLICY IF EXISTS "users_admin_all" ON public.users;

CREATE POLICY "users_admin_all"
    ON public.users
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.user_id = auth.uid()
              AND u.role = 'admin'::user_role
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.user_id = auth.uid()
              AND u.role = 'admin'::user_role
        )
    );


-- ============================================================================
-- 2. CHANGE platform_role DEFAULT FROM 'none' TO 'student'
--    Every new user should be a student by default.
-- ============================================================================

ALTER TABLE public.users
    ALTER COLUMN platform_role SET DEFAULT 'student'::public.platform_role;

-- Also update any existing users still on 'none' to 'student'
-- (optional — remove if you want to keep existing 'none' users as-is)
UPDATE public.users
SET platform_role = 'student'::public.platform_role
WHERE platform_role = 'none'::public.platform_role;


-- ============================================================================
-- 3. AUTO-CREATE company_credit_summary WHEN A NEW COMPANY IS INSERTED
--    Trigger function + trigger on public.company.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_company_credit_summary()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.company_credit_summary (
        company_id,
        total_balance,
        available_balance,
        held_balance,
        last_updated
    )
    VALUES (
        NEW.company_id,
        0,    -- Initial total balance
        0,    -- Initial available balance
        0,    -- Initial held balance
        NOW()
    )
    ON CONFLICT (company_id) DO NOTHING;

    RETURN NEW;
END;
$$;

-- Drop trigger if it already exists (idempotent)
DROP TRIGGER IF EXISTS trg_new_company_credit_summary ON public.company;

CREATE TRIGGER trg_new_company_credit_summary
    AFTER INSERT ON public.company
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_company_credit_summary();


-- ============================================================================
-- 4. BACKFILL: Create credit summary for any existing companies that don't
--    have one yet (covers companies created before this trigger existed).
-- ============================================================================

INSERT INTO public.company_credit_summary (
    company_id,
    total_balance,
    available_balance,
    held_balance,
    last_updated
)
SELECT
    c.company_id,
    0,
    0,
    0,
    NOW()
FROM public.company c
WHERE c.company_id NOT IN (
    SELECT ccs.company_id FROM public.company_credit_summary ccs
)
ON CONFLICT (company_id) DO NOTHING;
