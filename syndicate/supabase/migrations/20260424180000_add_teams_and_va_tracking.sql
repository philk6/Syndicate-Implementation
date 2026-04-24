-- ============================================================================
-- Multi-tenant teams, VA role, per-team projects, VA daily reports
-- Created: 2026-04-24
-- Description:
--   Extends the single-tenant warehouse tracking into per-team ("tenant")
--   tracking. The existing warehouse employees become a single platform
--   team owned by the platform admin; one-on-one students each get their
--   own team populated with VAs who clock in against team-scoped projects.
--
--   Existing behavior is preserved — the /admin/employees dashboard, the
--   /my-time clock-in/out, and the payroll CSV all continue to work for
--   the warehouse team after backfill.
-- ============================================================================

-- 1. Teams table. Exactly one team per one-on-one student (created on flag
--    flip) plus the singleton Warehouse team owned by the platform admin.
CREATE TABLE IF NOT EXISTS public.teams (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT NOT NULL,
    owner_id     UUID NOT NULL REFERENCES public.users(user_id) ON DELETE RESTRICT,
    is_warehouse BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS teams_owner_id_idx ON public.teams(owner_id);
-- Only one warehouse team can exist.
CREATE UNIQUE INDEX IF NOT EXISTS teams_warehouse_singleton_idx
    ON public.teams(is_warehouse) WHERE is_warehouse = TRUE;

-- 2. One-on-one student flag on users.
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS is_one_on_one_student BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. VA role — additive to existing user_role enum ('user', 'admin', 'employee').
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'user_role' AND e.enumlabel = 'va'
    ) THEN
        ALTER TYPE public.user_role ADD VALUE 'va';
    END IF;
END$$;

-- 4. VA permission profile enum.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'va_profile') THEN
        CREATE TYPE public.va_profile AS ENUM (
            'research',
            'operations',
            'customer_service',
            'full_access'
        );
    END IF;
END$$;

-- 5. employees.team_id (backfilled below) + employees.va_profile (NULL for
--    warehouse employees).
ALTER TABLE public.employees
    ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE RESTRICT;
ALTER TABLE public.employees
    ADD COLUMN IF NOT EXISTS va_profile public.va_profile;

-- 6. Per-team projects — VA equivalent of orders for labor tagging.
CREATE TABLE IF NOT EXISTS public.team_projects (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id      UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    description  TEXT,
    active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_by   UUID REFERENCES public.users(user_id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS team_projects_team_id_idx ON public.team_projects(team_id, active);

-- 7. time_entries.project_id — mutually exclusive with order_id, enforced
--    in the application layer (VA => project_id; employee => order_id).
ALTER TABLE public.time_entries
    ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.team_projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS time_entries_project_idx
    ON public.time_entries(project_id) WHERE project_id IS NOT NULL;

-- 8. VA daily reports — one-per-VA-per-day (unique index) with editable
--    accomplishments field; new clock-ins on the same day append to the
--    existing report rather than create duplicates.
CREATE TABLE IF NOT EXISTS public.va_daily_reports (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id        UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    report_date        DATE NOT NULL,
    accomplishments    TEXT NOT NULL CHECK (char_length(accomplishments) BETWEEN 20 AND 2000),
    stuck_on           TEXT CHECK (char_length(stuck_on) <= 1000),
    tomorrow_plan      TEXT CHECK (char_length(tomorrow_plan) <= 1000),
    hours_summary_json JSONB NOT NULL,
    submitted_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    edited_by          UUID REFERENCES public.users(user_id),
    edited_at          TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS va_daily_reports_one_per_va_per_day_idx
    ON public.va_daily_reports(employee_id, report_date);
CREATE INDEX IF NOT EXISTS va_daily_reports_employee_idx
    ON public.va_daily_reports(employee_id, report_date DESC);

-- 9. Backfill: warehouse team + assign existing employees.
DO $$
DECLARE
    v_warehouse_team_id  UUID;
    v_warehouse_owner_id UUID;
    v_existing_team_id   UUID;
BEGIN
    -- Re-use an existing warehouse team row if the migration is re-run.
    SELECT id INTO v_existing_team_id FROM public.teams WHERE is_warehouse = TRUE;

    IF v_existing_team_id IS NOT NULL THEN
        v_warehouse_team_id := v_existing_team_id;
    ELSE
        SELECT user_id INTO v_warehouse_owner_id
        FROM public.users
        WHERE role = 'admin'
        ORDER BY created_at ASC
        LIMIT 1;

        IF v_warehouse_owner_id IS NULL THEN
            RAISE EXCEPTION 'No admin user found — cannot create warehouse team';
        END IF;

        INSERT INTO public.teams (name, owner_id, is_warehouse)
        VALUES ('Warehouse', v_warehouse_owner_id, TRUE)
        RETURNING id INTO v_warehouse_team_id;
    END IF;

    UPDATE public.employees
    SET team_id = v_warehouse_team_id
    WHERE team_id IS NULL;
END $$;

-- After backfill, team_id is required on every employees row.
ALTER TABLE public.employees ALTER COLUMN team_id SET NOT NULL;


-- 10. RLS helpers.
CREATE OR REPLACE FUNCTION public.user_is_admin(check_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.users
        WHERE user_id = check_user_id AND role = 'admin'
    );
$$;

CREATE OR REPLACE FUNCTION public.user_belongs_to_team(check_user_id UUID, check_team_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.teams t
        WHERE t.id = check_team_id AND t.owner_id = check_user_id
    ) OR EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.team_id = check_team_id AND e.user_id = check_user_id AND e.active = TRUE
    );
$$;


-- 11. RLS
ALTER TABLE public.teams            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_projects    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.va_daily_reports ENABLE ROW LEVEL SECURITY;

-- teams
DROP POLICY IF EXISTS teams_owner_or_member_read ON public.teams;
DROP POLICY IF EXISTS teams_admin_all            ON public.teams;
DROP POLICY IF EXISTS teams_owner_update         ON public.teams;

CREATE POLICY teams_owner_or_member_read ON public.teams FOR SELECT TO authenticated
    USING (public.user_belongs_to_team(auth.uid(), id) OR public.user_is_admin(auth.uid()));

CREATE POLICY teams_admin_all ON public.teams FOR ALL TO authenticated
    USING      (public.user_is_admin(auth.uid()))
    WITH CHECK (public.user_is_admin(auth.uid()));

-- Owner can rename their team (never the warehouse singleton).
CREATE POLICY teams_owner_update ON public.teams FOR UPDATE TO authenticated
    USING      (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid() AND is_warehouse = FALSE);

-- team_projects
DROP POLICY IF EXISTS team_projects_team_member_read ON public.team_projects;
DROP POLICY IF EXISTS team_projects_owner_write      ON public.team_projects;

CREATE POLICY team_projects_team_member_read ON public.team_projects FOR SELECT TO authenticated
    USING (public.user_belongs_to_team(auth.uid(), team_id) OR public.user_is_admin(auth.uid()));

CREATE POLICY team_projects_owner_write ON public.team_projects FOR ALL TO authenticated
    USING (
        public.user_is_admin(auth.uid())
        OR EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_projects.team_id AND t.owner_id = auth.uid())
    )
    WITH CHECK (
        public.user_is_admin(auth.uid())
        OR EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_projects.team_id AND t.owner_id = auth.uid())
    );

-- employees: replace the admin-only policy with team-owner + admin access;
-- keep the self-read policy unchanged (VAs + employees still see only their row).
DROP POLICY IF EXISTS employees_admin_all      ON public.employees;
DROP POLICY IF EXISTS employees_team_owner_all ON public.employees;

CREATE POLICY employees_team_owner_all ON public.employees FOR ALL TO authenticated
    USING (
        public.user_is_admin(auth.uid())
        OR EXISTS (SELECT 1 FROM public.teams t WHERE t.id = employees.team_id AND t.owner_id = auth.uid())
    )
    WITH CHECK (
        public.user_is_admin(auth.uid())
        OR EXISTS (SELECT 1 FROM public.teams t WHERE t.id = employees.team_id AND t.owner_id = auth.uid())
    );

-- time_entries: replace the admin-only full-access policy with team-owner + admin.
-- The existing self-read/self-insert/self-update-open policies (from the prior
-- migration) already wall off VA-A from VA-B inside the same team.
DROP POLICY IF EXISTS time_entries_admin_all      ON public.time_entries;
DROP POLICY IF EXISTS time_entries_team_owner_all ON public.time_entries;

CREATE POLICY time_entries_team_owner_all ON public.time_entries FOR ALL TO authenticated
    USING (
        public.user_is_admin(auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.employees e JOIN public.teams t ON t.id = e.team_id
            WHERE e.id = time_entries.employee_id AND t.owner_id = auth.uid()
        )
    )
    WITH CHECK (
        public.user_is_admin(auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.employees e JOIN public.teams t ON t.id = e.team_id
            WHERE e.id = time_entries.employee_id AND t.owner_id = auth.uid()
        )
    );

-- va_daily_reports
DROP POLICY IF EXISTS va_daily_reports_self_read       ON public.va_daily_reports;
DROP POLICY IF EXISTS va_daily_reports_self_insert     ON public.va_daily_reports;
DROP POLICY IF EXISTS va_daily_reports_self_update     ON public.va_daily_reports;
DROP POLICY IF EXISTS va_daily_reports_team_owner_all  ON public.va_daily_reports;

CREATE POLICY va_daily_reports_self_read ON public.va_daily_reports FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = va_daily_reports.employee_id AND e.user_id = auth.uid()
    ));

CREATE POLICY va_daily_reports_self_insert ON public.va_daily_reports FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = va_daily_reports.employee_id AND e.user_id = auth.uid()
    ));

CREATE POLICY va_daily_reports_self_update ON public.va_daily_reports FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = va_daily_reports.employee_id AND e.user_id = auth.uid()
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = va_daily_reports.employee_id AND e.user_id = auth.uid()
    ));

CREATE POLICY va_daily_reports_team_owner_all ON public.va_daily_reports FOR ALL TO authenticated
    USING (
        public.user_is_admin(auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.employees e JOIN public.teams t ON t.id = e.team_id
            WHERE e.id = va_daily_reports.employee_id AND t.owner_id = auth.uid()
        )
    )
    WITH CHECK (
        public.user_is_admin(auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.employees e JOIN public.teams t ON t.id = e.team_id
            WHERE e.id = va_daily_reports.employee_id AND t.owner_id = auth.uid()
        )
    );


-- 12. Extend the switch-task RPC to accept project_id as well. The prior
--     version was limited to order_id; now the caller passes exactly one of
--     order_id/project_id per the app-layer rule.
CREATE OR REPLACE FUNCTION public.my_time_switch_task(
    p_new_task       public.task_type,
    p_new_order_id   INTEGER,
    p_new_project_id UUID,
    p_new_note       TEXT
) RETURNS public.time_entries
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_employee_id UUID;
    v_open_id     UUID;
    v_new_entry   public.time_entries;
BEGIN
    SELECT id INTO v_employee_id
    FROM public.employees
    WHERE user_id = auth.uid() AND active = TRUE;

    IF v_employee_id IS NULL THEN
        RAISE EXCEPTION 'No active employee record for current user';
    END IF;

    SELECT id INTO v_open_id
    FROM public.time_entries
    WHERE employee_id = v_employee_id AND ended_at IS NULL
    ORDER BY started_at DESC
    LIMIT 1;

    IF v_open_id IS NULL THEN
        RAISE EXCEPTION 'No open time entry to switch from — clock in first';
    END IF;

    UPDATE public.time_entries
    SET ended_at = NOW()
    WHERE id = v_open_id;

    INSERT INTO public.time_entries (employee_id, started_at, task, order_id, project_id, note)
    VALUES (v_employee_id, NOW(), p_new_task, p_new_order_id, p_new_project_id, p_new_note)
    RETURNING * INTO v_new_entry;

    RETURN v_new_entry;
END;
$$;

-- Drop the older 3-arg signature if it's still around, then grant the new one.
DROP FUNCTION IF EXISTS public.my_time_switch_task(public.task_type, INTEGER, TEXT);
GRANT EXECUTE ON FUNCTION public.my_time_switch_task(public.task_type, INTEGER, UUID, TEXT) TO authenticated;


-- 13. Schema cache reload so PostgREST picks up the new tables + enum values.
NOTIFY pgrst, 'reload schema';
