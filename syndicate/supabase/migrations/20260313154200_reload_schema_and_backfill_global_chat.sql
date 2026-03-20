-- ============================================================================
-- Migration: Reload PostgREST schema cache and backfill global chat
-- Created:   2026-03-13
-- Description:
--   1. Notify PostgREST to reload its schema cache so it can see the new
--      chat_rooms, chat_participants, chat_messages tables.
--   2. Backfill existing users into the Global Chat room (the trigger only
--      fires for NEW users, so existing users were never added).
-- ============================================================================

-- ============================================================================
-- 1. NOTIFY PostgREST to reload its schema cache
--    This is the standard mechanism: send a NOTIFY on 'pgrst' channel
--    with payload 'reload schema'.
-- ============================================================================

NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- 2. BACKFILL: Add ALL existing users to the Global Chat room
--    The trigger trg_new_user_join_global_chat only fires on INSERT, so
--    users who existed before the chat system migration were never enrolled.
-- ============================================================================

INSERT INTO public.chat_participants (room_id, user_id, joined_at)
SELECT cr.id, u.user_id, NOW()
FROM public.chat_rooms cr
CROSS JOIN public.users u
WHERE cr.type = 'global'
ON CONFLICT (room_id, user_id) DO NOTHING;
