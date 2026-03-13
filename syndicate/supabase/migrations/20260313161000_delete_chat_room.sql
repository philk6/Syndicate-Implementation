-- Delete chat room a681fd67-b826-41a6-8fe9-fe08af3a86d1
-- CASCADE will also remove related chat_participants and chat_messages
DELETE FROM public.chat_rooms WHERE id = 'a681fd67-b826-41a6-8fe9-fe08af3a86d1';
