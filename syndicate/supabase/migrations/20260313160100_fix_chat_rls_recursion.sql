-- ============================================================================
-- Migration: Fix infinite RLS recursion on chat tables
-- Created:   2026-03-13
-- Description:
--   The chat_participants_member_select policy queries chat_participants
--   from within a policy ON chat_participants → infinite recursion.
--   Similarly, chat_rooms and chat_messages policies use inline EXISTS
--   against chat_participants, triggering the same recursion.
--
--   Fix: Rewrite ALL non-admin chat policies to use the existing
--   SECURITY DEFINER function is_room_participant() which bypasses RLS.
-- ============================================================================


-- ============================================================================
-- 1. Recreate is_room_participant as SECURITY DEFINER (ensure it exists)
-- ============================================================================

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


-- ============================================================================
-- 2. Fix chat_participants policies
-- ============================================================================

DROP POLICY IF EXISTS "chat_participants_member_select" ON public.chat_participants;

CREATE POLICY "chat_participants_member_select"
    ON public.chat_participants
    AS PERMISSIVE
    FOR SELECT
    TO authenticated
    USING (
        -- Use SECURITY DEFINER function to avoid self-referencing recursion
        public.is_room_participant(room_id)
    );


-- ============================================================================
-- 3. Fix chat_rooms policies
-- ============================================================================

DROP POLICY IF EXISTS "chat_rooms_participant_select" ON public.chat_rooms;

CREATE POLICY "chat_rooms_participant_select"
    ON public.chat_rooms
    AS PERMISSIVE
    FOR SELECT
    TO authenticated
    USING (
        public.is_room_participant(id)
    );


-- ============================================================================
-- 4. Fix chat_messages policies
-- ============================================================================

-- SELECT policy
DROP POLICY IF EXISTS "chat_messages_participant_select" ON public.chat_messages;

CREATE POLICY "chat_messages_participant_select"
    ON public.chat_messages
    AS PERMISSIVE
    FOR SELECT
    TO authenticated
    USING (
        public.is_room_participant(room_id)
    );

-- INSERT policy
DROP POLICY IF EXISTS "chat_messages_participant_insert" ON public.chat_messages;

CREATE POLICY "chat_messages_participant_insert"
    ON public.chat_messages
    AS PERMISSIVE
    FOR INSERT
    TO authenticated
    WITH CHECK (
        sender_id = auth.uid()
        AND public.is_room_participant(room_id)
    );


-- ============================================================================
-- 5. Reload PostgREST schema cache
-- ============================================================================

NOTIFY pgrst, 'reload schema';
