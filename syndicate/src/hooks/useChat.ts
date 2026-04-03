'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@lib/supabase/client';
import { useAuth } from '@lib/auth';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ChatRoom {
  id: string;
  name: string;
  type: 'global' | '1on1';
  created_at: string;
}

export interface ChatMessage {
  id: string;
  room_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  sender?: {
    firstname: string | null;
    lastname: string | null;
  };
}

export interface ChatParticipant {
  room_id: string;
  user_id: string;
  joined_at: string;
  user?: {
    firstname: string | null;
    lastname: string | null;
    company_id?: number | null;
  };
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useChat() {
  const { user, isAuthenticated } = useAuth();
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [participants, setParticipants] = useState<ChatParticipant[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [userPlatformRole, setUserPlatformRole] = useState<string>('none');
  const [userMembershipEndDate, setUserMembershipEndDate] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ── Fetch rooms the current user participates in ─────────────────────────

  const fetchRooms = useCallback(async () => {
    if (!user?.user_id) {
      console.log('[useChat] fetchRooms: no user_id, skipping');
      return;
    }
    setLoadingRooms(true);
    console.log('[useChat] fetchRooms: starting for user_id:', user.user_id);

    try {
      // Get room IDs the user participates in
      const { data: participantRows, error: pErr } = await supabase
        .from('chat_participants')
        .select('room_id')
        .eq('user_id', user.user_id);

      console.log('[useChat] participant query result:', { data: participantRows, error: pErr });

      if (pErr) {
        console.error('[useChat] Error fetching participant rows:', pErr.message, pErr);
        setLoadingRooms(false);
        return;
      }

      if (!participantRows || participantRows.length === 0) {
        console.log('[useChat] No participant rows found for this user');
        setRooms([]);
        setLoadingRooms(false);
        return;
      }

      const roomIds = participantRows.map((p) => p.room_id);
      console.log('[useChat] room IDs to fetch:', roomIds);

      const { data: roomData, error: rErr } = await supabase
        .from('chat_rooms')
        .select('*')
        .in('id', roomIds)
        .order('type', { ascending: true }) // global first
        .order('created_at', { ascending: true });

      console.log('[useChat] rooms query result:', { data: roomData, error: rErr });

      if (rErr) {
        console.error('[useChat] Error fetching rooms:', rErr.message, rErr);
      } else {
        setRooms(roomData ?? []);
        // Auto-select the first room if none selected
        if (!activeRoomId && roomData && roomData.length > 0) {
          setActiveRoomId(roomData[0].id);
        }
      }
    } catch (err) {
      console.error('[useChat] Exception fetching rooms:', err);
    } finally {
      setLoadingRooms(false);
    }
  }, [user?.user_id, activeRoomId]);

  // ── Fetch messages for the active room ───────────────────────────────────

  const fetchMessages = useCallback(async (roomId: string) => {
    setLoadingMessages(true);

    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select(`
          id,
          room_id,
          sender_id,
          content,
          created_at,
          sender:users!chat_messages_sender_id_fkey (
            firstname,
            lastname
          )
        `)
        .eq('room_id', roomId)
        .order('created_at', { ascending: true })
        .limit(200);

      if (error) {
        console.error('Error fetching messages:', error.message);
      } else {
        // Normalize the sender join (Supabase returns object or array depending on cardinality)
        const normalized = (data ?? []).map((msg) => ({
          ...msg,
          sender: Array.isArray(msg.sender) ? msg.sender[0] : msg.sender,
        })) as ChatMessage[];
        setMessages(normalized);
      }
    } catch (err) {
      console.error('Exception fetching messages:', err);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  // ── Fetch participants for the active room ───────────────────────────────

  const fetchParticipants = useCallback(async (roomId: string) => {
    try {
      const { data, error } = await supabase
        .from('chat_participants')
        .select(`
          room_id,
          user_id,
          joined_at,
          user:users!chat_participants_user_id_fkey (
            firstname,
            lastname,
            company_id
          )
        `)
        .eq('room_id', roomId);

      if (error) {
        console.error('Error fetching participants:', error.message);
      } else {
        const normalized = (data ?? []).map((p) => ({
          ...p,
          user: Array.isArray(p.user) ? p.user[0] : p.user,
        })) as ChatParticipant[];
        setParticipants(normalized);
      }
    } catch (err) {
      console.error('Exception fetching participants:', err);
    }
  }, []);

  // ── Send a message ───────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (content: string) => {
      if (!user?.user_id || !activeRoomId || !content.trim()) return;
      setSending(true);

      try {
        const { error } = await supabase.from('chat_messages').insert({
          room_id: activeRoomId,
          sender_id: user.user_id,
          content: content.trim(),
        });

        if (error) {
          console.error('Error sending message:', error.message);
        }
      } catch (err) {
        console.error('Exception sending message:', err);
      } finally {
        setSending(false);
      }
    },
    [user?.user_id, activeRoomId],
  );

  // ── Delete a message (admin only) ───────────────────────────────────────

  const deleteMessage = useCallback(
    async (messageId: string) => {
      try {
        const { error } = await supabase
          .from('chat_messages')
          .delete()
          .eq('id', messageId);

        if (error) {
          console.error('Error deleting message:', error.message);
        } else {
          // Optimistically remove from local state
          setMessages((prev) => prev.filter((m) => m.id !== messageId));
        }
      } catch (err) {
        console.error('Exception deleting message:', err);
      }
    },
    [],
  );

  // ── Select a room ───────────────────────────────────────────────────────

  const selectRoom = useCallback((roomId: string) => {
    setActiveRoomId(roomId);
    setMessages([]); // Clear old messages immediately for snappy UX
  }, []);

  // ── Realtime subscription ───────────────────────────────────────────────

  useEffect(() => {
    if (!activeRoomId || !user?.user_id) return;

    // Fetch initial data when room changes
    fetchMessages(activeRoomId);
    fetchParticipants(activeRoomId);

    // Tear down any previous channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    // Subscribe to message changes in the active room via Realtime
    const channel = supabase
      .channel(`chat_room_${activeRoomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `room_id=eq.${activeRoomId}`,
        },
        async (payload) => {
          const newMsg = payload.new as ChatMessage;

          // Fetch the sender details for the new message
          const { data: senderData } = await supabase
            .from('users')
            .select('firstname, lastname')
            .eq('user_id', newMsg.sender_id)
            .single();

          const enrichedMsg: ChatMessage = {
            ...newMsg,
            sender: senderData ?? { firstname: null, lastname: null },
          };

          setMessages((prev) => {
            // Avoid duplicates
            if (prev.some((m) => m.id === enrichedMsg.id)) return prev;
            return [...prev, enrichedMsg];
          });
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'chat_messages',
          filter: `room_id=eq.${activeRoomId}`,
        },
        (payload) => {
          const deletedId = (payload.old as { id?: string }).id;
          if (deletedId) {
            setMessages((prev) => prev.filter((m) => m.id !== deletedId));
          }
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [activeRoomId, user?.user_id, fetchMessages, fetchParticipants]);

  // ── Fetch rooms on mount ────────────────────────────────────────────────

  useEffect(() => {
    if (isAuthenticated && user?.user_id) {
      fetchRooms();
    }
  }, [isAuthenticated, user?.user_id, fetchRooms]);

  // ── Fetch current user's chat-relevant profile fields ───────────────────

  useEffect(() => {
    if (!user?.user_id) return;

    const fetchUserProfile = async () => {
      const { data, error } = await supabase
        .from('users')
        .select('platform_role, membership_end_date')
        .eq('user_id', user.user_id)
        .single();

      if (!error && data) {
        setUserPlatformRole(data.platform_role ?? 'none');
        setUserMembershipEndDate(data.membership_end_date ?? null);
      }
    };

    fetchUserProfile();
  }, [user?.user_id]);

  // ── Derived ─────────────────────────────────────────────────────────────

  const activeRoom = rooms.find((r) => r.id === activeRoomId) ?? null;

  return {
    // State
    rooms,
    activeRoom,
    activeRoomId,
    messages,
    participants,
    loadingRooms,
    loadingMessages,
    sending,
    currentUserId: user?.user_id ?? null,
    userPlatformRole,
    userMembershipEndDate,
    userRole: user?.role ?? 'user',

    // Actions
    selectRoom,
    sendMessage,
    deleteMessage,
    fetchRooms,
  };
}
