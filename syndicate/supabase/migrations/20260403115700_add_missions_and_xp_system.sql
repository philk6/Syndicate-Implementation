-- Migration: add_missions_and_xp_system
-- Description: Creates tables for the Mission & XP gamification system.
--              Includes missions, tasks, user_task_progress, and xp_transactions.
--              RLS policies are NOT included — they will be added in a follow-up migration.

-- =============================================
-- Helper: updated_at trigger function (idempotent)
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


-- =============================================
-- Table: missions
-- =============================================
CREATE TABLE public.missions (
    id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title       TEXT NOT NULL,
    description TEXT,
    xp_reward   INTEGER NOT NULL DEFAULT 0,
    target_audience VARCHAR(20) NOT NULL DEFAULT 'all'
        CHECK (target_audience IN ('all', '1on1', 'buyersgroup')),
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TRIGGER missions_updated_at
    BEFORE UPDATE ON public.missions
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

COMMENT ON TABLE  public.missions IS 'Admin-created missions that users can complete to earn XP.';
COMMENT ON COLUMN public.missions.target_audience IS 'Who can see/attempt this mission: all, 1on1, or buyersgroup.';


-- =============================================
-- Table: tasks
-- =============================================
CREATE TABLE public.tasks (
    id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    mission_id      INTEGER NOT NULL
        REFERENCES public.missions (id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    description     TEXT,
    order_index     INTEGER NOT NULL DEFAULT 0,
    requires_proof  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TRIGGER tasks_updated_at
    BEFORE UPDATE ON public.tasks
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- Fast lookup of tasks belonging to a mission, returned in order.
CREATE INDEX tasks_mission_id_order_idx
    ON public.tasks (mission_id, order_index);

COMMENT ON TABLE  public.tasks IS 'Individual steps within a mission.';
COMMENT ON COLUMN public.tasks.order_index IS 'Display order within the parent mission (lower = first).';
COMMENT ON COLUMN public.tasks.requires_proof IS 'When true the user must submit a URL or text as proof of completion.';


-- =============================================
-- Table: user_task_progress
-- =============================================
CREATE TABLE public.user_task_progress (
    id               INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id          UUID NOT NULL
        REFERENCES public.users (user_id) ON DELETE CASCADE,
    task_id          INTEGER NOT NULL
        REFERENCES public.tasks (id) ON DELETE CASCADE,
    status           VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'submitted', 'approved', 'rejected')),
    proof_submission TEXT,
    submitted_at     TIMESTAMP WITH TIME ZONE,
    reviewed_at      TIMESTAMP WITH TIME ZONE,
    reviewed_by      UUID
        REFERENCES public.users (user_id) ON DELETE SET NULL,
    created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TRIGGER user_task_progress_updated_at
    BEFORE UPDATE ON public.user_task_progress
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- A user can only have one progress row per task.
CREATE UNIQUE INDEX user_task_progress_user_task_uniq
    ON public.user_task_progress (user_id, task_id);

-- Quick lookup: all progress for a given user.
CREATE INDEX user_task_progress_user_id_idx
    ON public.user_task_progress (user_id);

-- Quick lookup: all submissions waiting for review.
CREATE INDEX user_task_progress_status_idx
    ON public.user_task_progress (status)
    WHERE status = 'submitted';

COMMENT ON TABLE  public.user_task_progress IS 'Tracks each user''s progress on individual tasks.';
COMMENT ON COLUMN public.user_task_progress.proof_submission IS 'URL or free-text proof supplied by the user (required when task.requires_proof is true).';
COMMENT ON COLUMN public.user_task_progress.reviewed_by IS 'The admin user_id who approved or rejected this submission.';


-- =============================================
-- Table: xp_transactions
-- =============================================
CREATE TABLE public.xp_transactions (
    id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id      UUID NOT NULL
        REFERENCES public.users (user_id) ON DELETE CASCADE,
    amount       INTEGER NOT NULL,
    source       VARCHAR(40) NOT NULL
        CHECK (source IN ('mission_completion', 'manual_adjustment')),
    reference_id INTEGER,                       -- nullable; links to missions.id when source = 'mission_completion'
    created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Fast lookup: all XP rows for a user (for computing total XP).
CREATE INDEX xp_transactions_user_id_idx
    ON public.xp_transactions (user_id);

-- Fast lookup: find the XP row linked to a specific mission for a user.
CREATE INDEX xp_transactions_user_source_ref_idx
    ON public.xp_transactions (user_id, source, reference_id);

COMMENT ON TABLE  public.xp_transactions IS 'Immutable ledger of XP earned or adjusted for each user.';
COMMENT ON COLUMN public.xp_transactions.amount IS 'Positive for earned XP, negative for deductions/adjustments.';
COMMENT ON COLUMN public.xp_transactions.source IS 'Origin of the transaction: mission_completion or manual_adjustment.';
COMMENT ON COLUMN public.xp_transactions.reference_id IS 'When source is mission_completion this holds the missions.id.';


-- =============================================
-- Enable RLS (policies will be added later)
-- =============================================
ALTER TABLE public.missions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_task_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xp_transactions    ENABLE ROW LEVEL SECURITY;
