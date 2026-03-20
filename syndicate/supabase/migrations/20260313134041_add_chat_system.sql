-- ============================================================================
-- Migration: Chat System
-- Created:   2026-03-13
-- Description:
--   1. New ENUM: platform_role ('student', 'mentor', 'none')
--   2. Alter users: add platform_role & has_1on1_membership columns
--   3. New tables: chat_rooms, chat_participants, chat_messages
--   4. RLS policies on all chat tables
--   5. Trigger #1: auto-add new users to Global Chat
--   6. Trigger #2: auto-create 1-on-1 room when student gains membership
-- ============================================================================

-- ============================================================================
-- 1. CREATE ENUM: platform_role
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'platform_role') THEN
        CREATE TYPE public.platform_role AS ENUM ('student', 'mentor', 'none');
    END IF;
END
$$;

-- ============================================================================
-- 2. ALTER TABLE: public.users — add new columns
-- ============================================================================
ALTER TABLE public.users
    ADD COLUMN platform_role public.platform_role NOT NULL DEFAULT 'none'::public.platform_role;

ALTER TABLE public.users
    ADD COLUMN has_1on1_membership BOOLEAN NOT NULL DEFAULT FALSE;

-- ============================================================================
-- 3. CREATE TABLES: chat_rooms, chat_participants, chat_messages
-- ============================================================================

-- ---- chat_rooms ---------------------------------------------------------
CREATE TABLE public.chat_rooms (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    type        VARCHAR(10) NOT NULL CHECK (type IN ('global', '1on1')),
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE public.chat_rooms ENABLE ROW LEVEL SECURITY;

-- ---- chat_participants --------------------------------------------------
CREATE TABLE public.chat_participants (
    room_id     UUID NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
    joined_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (room_id, user_id)
);

ALTER TABLE public.chat_participants ENABLE ROW LEVEL SECURITY;

-- ---- chat_messages ------------------------------------------------------
CREATE TABLE public.chat_messages (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id     UUID NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
    sender_id   UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
    content     TEXT NOT NULL,
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Indexes for query performance
CREATE INDEX idx_chat_messages_room_id ON public.chat_messages(room_id);
CREATE INDEX idx_chat_messages_created_at ON public.chat_messages(created_at);
CREATE INDEX idx_chat_participants_user_id ON public.chat_participants(user_id);

-- ============================================================================
-- 4. ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- --------------------------------------------------------------------------
-- Helper: is the current user an admin?
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_chat_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.users
        WHERE user_id = auth.uid()
          AND role = 'admin'::user_role
    );
$$;

-- --------------------------------------------------------------------------
-- Helper: is the current user a participant of a given room?
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_room_participant(p_room_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.chat_participants
        WHERE room_id = p_room_id
          AND user_id = auth.uid()
    );
$$;

-- --------------------------------------------------------------------------
-- chat_rooms policies
-- --------------------------------------------------------------------------

-- Admins: full access
CREATE POLICY "chat_rooms_admin_all"
    ON public.chat_rooms
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING  (public.is_chat_admin())
    WITH CHECK (public.is_chat_admin());

-- Participants: can see rooms they belong to
CREATE POLICY "chat_rooms_participant_select"
    ON public.chat_rooms
    AS PERMISSIVE
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.chat_participants cp
            WHERE cp.room_id = chat_rooms.id
              AND cp.user_id = auth.uid()
        )
    );

-- --------------------------------------------------------------------------
-- chat_participants policies
-- --------------------------------------------------------------------------

-- Admins: full access
CREATE POLICY "chat_participants_admin_all"
    ON public.chat_participants
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING  (public.is_chat_admin())
    WITH CHECK (public.is_chat_admin());

-- Users: can see participants in rooms they belong to
CREATE POLICY "chat_participants_member_select"
    ON public.chat_participants
    AS PERMISSIVE
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.chat_participants cp
            WHERE cp.room_id = chat_participants.room_id
              AND cp.user_id = auth.uid()
        )
    );

-- --------------------------------------------------------------------------
-- chat_messages policies
-- --------------------------------------------------------------------------

-- Admins: full access
CREATE POLICY "chat_messages_admin_all"
    ON public.chat_messages
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING  (public.is_chat_admin())
    WITH CHECK (public.is_chat_admin());

-- Participants: can READ messages in rooms they belong to
CREATE POLICY "chat_messages_participant_select"
    ON public.chat_messages
    AS PERMISSIVE
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.chat_participants cp
            WHERE cp.room_id = chat_messages.room_id
              AND cp.user_id = auth.uid()
        )
    );

-- Participants: can INSERT messages in rooms they belong to (sender must be self)
CREATE POLICY "chat_messages_participant_insert"
    ON public.chat_messages
    AS PERMISSIVE
    FOR INSERT
    TO authenticated
    WITH CHECK (
        sender_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.chat_participants cp
            WHERE cp.room_id = chat_messages.room_id
              AND cp.user_id = auth.uid()
        )
    );

-- ============================================================================
-- 5. GRANTS — allow authenticated & service_role to interact with chat tables
-- ============================================================================

-- chat_rooms
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_rooms TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_rooms TO service_role;

-- chat_participants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_participants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_participants TO service_role;

-- chat_messages
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_messages TO service_role;

-- ============================================================================
-- 6. TRIGGER #1: Auto-add new users to Global Chat room
--    When a new row is inserted into public.users, add them as a participant
--    of every chat_room where type = 'global'.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user_join_global_chat()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.chat_participants (room_id, user_id, joined_at)
    SELECT cr.id, NEW.user_id, NOW()
    FROM public.chat_rooms cr
    WHERE cr.type = 'global'
    ON CONFLICT (room_id, user_id) DO NOTHING;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_new_user_join_global_chat
    AFTER INSERT ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user_join_global_chat();

-- ============================================================================
-- 7. TRIGGER #2: Auto-create 1-on-1 room when a student gains membership
--    Fires when has_1on1_membership changes from FALSE → TRUE
--    AND the user's platform_role = 'student'.
--    Creates a new chat_room (type '1on1'), adds the student, and adds
--    ALL current mentors to the same room.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_student_1on1_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_room_id UUID;
    v_firstname VARCHAR;
BEGIN
    -- Only fire when has_1on1_membership flips from false → true
    -- AND the user is a student
    IF  OLD.has_1on1_membership = FALSE
        AND NEW.has_1on1_membership = TRUE
        AND NEW.platform_role = 'student'::platform_role
    THEN
        -- Get the student's first name for the room name
        v_firstname := COALESCE(NEW.firstname, 'Student');

        -- Create the 1-on-1 chat room
        INSERT INTO public.chat_rooms (name, type)
        VALUES (v_firstname || ' 1-on-1', '1on1')
        RETURNING id INTO v_room_id;

        -- Add the student to the room
        INSERT INTO public.chat_participants (room_id, user_id, joined_at)
        VALUES (v_room_id, NEW.user_id, NOW());

        -- Add ALL current mentors to the room
        INSERT INTO public.chat_participants (room_id, user_id, joined_at)
        SELECT v_room_id, u.user_id, NOW()
        FROM public.users u
        WHERE u.platform_role = 'mentor'::platform_role
          AND u.user_id != NEW.user_id  -- safety: avoid duplicate if somehow both
        ON CONFLICT (room_id, user_id) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_student_1on1_membership
    AFTER UPDATE ON public.users
    FOR EACH ROW
    WHEN (OLD.has_1on1_membership IS DISTINCT FROM NEW.has_1on1_membership)
    EXECUTE FUNCTION public.handle_student_1on1_membership();

-- ============================================================================
-- 8. SEED: Create the Global Chat room (if it doesn't exist yet)
--    Existing users will NOT be back-filled automatically; run manually if needed.
-- ============================================================================

INSERT INTO public.chat_rooms (name, type)
SELECT 'Global Chat', 'global'
WHERE NOT EXISTS (
    SELECT 1 FROM public.chat_rooms WHERE type = 'global'
);
