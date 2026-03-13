-- ============================================================================
-- Migration: Add membership expiry enforcement to chat system
-- Created:   2026-03-13
-- Description:
--   1. Add membership_end_date column to public.users
--   2. Replace the chat_messages INSERT policy to enforce expiry:
--      - Students in 1on1 rooms must have membership_end_date > NOW()
--      - Mentors, Admins, and global chat are unaffected
-- ============================================================================

-- ============================================================================
-- 1. ALTER TABLE: public.users — add membership_end_date
-- ============================================================================
ALTER TABLE public.users
    ADD COLUMN membership_end_date TIMESTAMP WITH TIME ZONE;

-- ============================================================================
-- 2. DROP + RECREATE the INSERT policy on chat_messages
--    The old policy "chat_messages_participant_insert" only checked:
--      sender_id = auth.uid() AND is_participant.
--    The new policy adds expiry enforcement for students in 1on1 rooms.
-- ============================================================================

DROP POLICY IF EXISTS "chat_messages_participant_insert" ON public.chat_messages;

CREATE POLICY "chat_messages_participant_insert"
    ON public.chat_messages
    AS PERMISSIVE
    FOR INSERT
    TO authenticated
    WITH CHECK (
        -- 1. Sender must be the authenticated user
        sender_id = auth.uid()

        -- 2. Sender must be a participant of the room
        AND EXISTS (
            SELECT 1 FROM public.chat_participants cp
            WHERE cp.room_id = chat_messages.room_id
              AND cp.user_id = auth.uid()
        )

        -- 3. Membership expiry check:
        --    Block ONLY if ALL of these are true:
        --      a) The room is a '1on1' room
        --      b) The user's platform_role is 'student'
        --      c) The user's membership has expired (end_date IS NULL or <= now)
        --    Everyone else (mentors, admins, non-students, global chat) passes through.
        AND NOT (
            -- Room is 1on1
            EXISTS (
                SELECT 1 FROM public.chat_rooms cr
                WHERE cr.id = chat_messages.room_id
                  AND cr.type = '1on1'
            )
            -- AND the user is a student
            AND EXISTS (
                SELECT 1 FROM public.users u
                WHERE u.user_id = auth.uid()
                  AND u.platform_role = 'student'::platform_role
            )
            -- AND their membership has expired or was never set
            AND NOT EXISTS (
                SELECT 1 FROM public.users u
                WHERE u.user_id = auth.uid()
                  AND u.membership_end_date IS NOT NULL
                  AND u.membership_end_date > CURRENT_TIMESTAMP
            )
        )
    );
