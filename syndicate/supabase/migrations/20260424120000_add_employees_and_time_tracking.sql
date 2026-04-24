-- ============================================================================
-- Employees + Time Tracking
-- Created: 2026-04-24
-- Description:
--   Adds the 'employee' role, per-employee profile rows, an hourly rate
--   history, a time_entries log (clock-in/out), and an audit log for admin
--   edits. The existing user_role enum is 'user' | 'admin'; we ADD 'employee'
--   rather than introducing a CHECK constraint, so existing role code keeps
--   working without change. 'Recruit' mentioned in the spec is the XP-rank
--   label (min_xp=0), NOT a DB role value — see src/lib/utils/xp.ts.
-- ============================================================================

-- 1. Extend the existing user_role enum with the new 'employee' value.
-- ALTER TYPE ... ADD VALUE runs outside a transaction in older Postgres,
-- so we wrap in a DO block that only touches it if the value is missing.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'user_role' AND e.enumlabel = 'employee'
    ) THEN
        ALTER TYPE public.user_role ADD VALUE 'employee';
    END IF;
END$$;

-- 2. Task type enum for time entries.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_type') THEN
        CREATE TYPE public.task_type AS ENUM (
            'prep',
            'shipping',
            'labeling',
            'receiving_order',
            'receiving_general',
            'cleaning',
            'break',
            'other'
        );
    END IF;
END$$;

-- 3. Employees table — per-user employment profile.
CREATE TABLE IF NOT EXISTS public.employees (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                UUID NOT NULL UNIQUE REFERENCES public.users(user_id) ON DELETE CASCADE,
    first_name             TEXT NOT NULL,
    last_name              TEXT NOT NULL,
    employment_start_date  DATE NOT NULL,
    active                 BOOLEAN NOT NULL DEFAULT TRUE,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS employees_user_id_idx ON public.employees(user_id);
CREATE INDEX IF NOT EXISTS employees_active_idx ON public.employees(active);

-- 4. Hourly rate history — payroll uses the rate effective at shift start.
CREATE TABLE IF NOT EXISTS public.employee_rates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id     UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    hourly_rate     NUMERIC(8,2) NOT NULL CHECK (hourly_rate >= 0),
    effective_from  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by      UUID REFERENCES public.users(user_id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS employee_rates_employee_id_effective_idx
    ON public.employee_rates(employee_id, effective_from DESC);

-- 5. Time entries — the core clock-in/out log.
--    Note: public.orders PK is `order_id` (integer), not `id`.
CREATE TABLE IF NOT EXISTS public.time_entries (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id  UUID NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
    started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at     TIMESTAMPTZ,
    task         public.task_type NOT NULL,
    order_id     INTEGER REFERENCES public.orders(order_id) ON DELETE SET NULL,
    note         TEXT CHECK (char_length(note) <= 500),
    edited_by    UUID REFERENCES public.users(user_id),
    edited_at    TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT time_entries_end_after_start CHECK (ended_at IS NULL OR ended_at > started_at)
);
CREATE INDEX IF NOT EXISTS time_entries_employee_started_idx
    ON public.time_entries(employee_id, started_at DESC);
CREATE INDEX IF NOT EXISTS time_entries_open_idx
    ON public.time_entries(employee_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS time_entries_order_idx
    ON public.time_entries(order_id) WHERE order_id IS NOT NULL;

-- 6. Edit audit log for time_entries — every admin edit gets a before/after snapshot.
CREATE TABLE IF NOT EXISTS public.time_entry_edits (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    time_entry_id   UUID NOT NULL REFERENCES public.time_entries(id) ON DELETE CASCADE,
    edited_by       UUID NOT NULL REFERENCES public.users(user_id),
    edited_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    before_snapshot JSONB NOT NULL,
    after_snapshot  JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS time_entry_edits_entry_idx
    ON public.time_entry_edits(time_entry_id, edited_at DESC);

-- 7. RLS
ALTER TABLE public.employees         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_rates    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entries      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entry_edits  ENABLE ROW LEVEL SECURITY;

-- employees
DROP POLICY IF EXISTS employees_self_read   ON public.employees;
DROP POLICY IF EXISTS employees_admin_all   ON public.employees;

CREATE POLICY employees_self_read ON public.employees FOR SELECT TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY employees_admin_all ON public.employees FOR ALL TO authenticated
    USING      (EXISTS (SELECT 1 FROM public.users u WHERE u.user_id = auth.uid() AND u.role = 'admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.user_id = auth.uid() AND u.role = 'admin'));

-- employee_rates
DROP POLICY IF EXISTS employee_rates_self_read  ON public.employee_rates;
DROP POLICY IF EXISTS employee_rates_admin_all  ON public.employee_rates;

CREATE POLICY employee_rates_self_read ON public.employee_rates FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = employee_rates.employee_id AND e.user_id = auth.uid()
    ));

CREATE POLICY employee_rates_admin_all ON public.employee_rates FOR ALL TO authenticated
    USING      (EXISTS (SELECT 1 FROM public.users u WHERE u.user_id = auth.uid() AND u.role = 'admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.user_id = auth.uid() AND u.role = 'admin'));

-- time_entries
DROP POLICY IF EXISTS time_entries_self_read          ON public.time_entries;
DROP POLICY IF EXISTS time_entries_self_insert        ON public.time_entries;
DROP POLICY IF EXISTS time_entries_self_update_open   ON public.time_entries;
DROP POLICY IF EXISTS time_entries_admin_all          ON public.time_entries;

CREATE POLICY time_entries_self_read ON public.time_entries FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = time_entries.employee_id AND e.user_id = auth.uid()
    ));

CREATE POLICY time_entries_self_insert ON public.time_entries FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = time_entries.employee_id AND e.user_id = auth.uid()
    ));

-- Employees may only update their open row (to close it). Historical edits are admin-only.
CREATE POLICY time_entries_self_update_open ON public.time_entries FOR UPDATE TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.employees e WHERE e.id = time_entries.employee_id AND e.user_id = auth.uid())
        AND ended_at IS NULL
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.employees e WHERE e.id = time_entries.employee_id AND e.user_id = auth.uid())
    );

CREATE POLICY time_entries_admin_all ON public.time_entries FOR ALL TO authenticated
    USING      (EXISTS (SELECT 1 FROM public.users u WHERE u.user_id = auth.uid() AND u.role = 'admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.user_id = auth.uid() AND u.role = 'admin'));

-- time_entry_edits — admin-read only; inserts come from service-role route handlers.
DROP POLICY IF EXISTS time_entry_edits_admin_read ON public.time_entry_edits;
CREATE POLICY time_entry_edits_admin_read ON public.time_entry_edits FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.users u WHERE u.user_id = auth.uid() AND u.role = 'admin'));


-- 8. RPC: atomic "switch task" used by /my-time. Closes the current open
--    entry and opens a new one for the same employee in one transaction.
CREATE OR REPLACE FUNCTION public.my_time_switch_task(
    p_new_task     public.task_type,
    p_new_order_id INTEGER,
    p_new_note     TEXT
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

    INSERT INTO public.time_entries (employee_id, started_at, task, order_id, note)
    VALUES (v_employee_id, NOW(), p_new_task, p_new_order_id, p_new_note)
    RETURNING * INTO v_new_entry;

    RETURN v_new_entry;
END;
$$;
GRANT EXECUTE ON FUNCTION public.my_time_switch_task(public.task_type, INTEGER, TEXT) TO authenticated;


-- 9. Schema cache reload so PostgREST picks up the new tables + enum values.
NOTIFY pgrst, 'reload schema';
