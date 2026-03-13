'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@lib/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UserPlus, Trash2, Loader2, Users, Search } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Participant {
  user_id: string;
  joined_at: string;
  firstname: string | null;
  lastname: string | null;
  email: string;
  platform_role: string;
}

interface MentorOption {
  user_id: string;
  firstname: string | null;
  lastname: string | null;
  email: string;
}

interface ManageChatMentorsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chatRoomId: string;
  chatRoomName: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ManageChatMentorsModal({
  open,
  onOpenChange,
  chatRoomId,
  chatRoomName,
}: ManageChatMentorsModalProps) {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [availableMentors, setAvailableMentors] = useState<MentorOption[]>([]);
  const [selectedMentorId, setSelectedMentorId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // ── Fetch current participants ───────────────────────────────────────────

  const fetchParticipants = useCallback(async () => {
    if (!chatRoomId) return;
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from('chat_participants')
        .select(`
          user_id,
          joined_at,
          user:users!chat_participants_user_id_fkey (
            firstname,
            lastname,
            email,
            platform_role
          )
        `)
        .eq('room_id', chatRoomId);

      if (error) {
        console.error('Error fetching participants:', error.message);
        setMessage({ text: 'Failed to load participants.', type: 'error' });
      } else {
        const normalised = (data ?? []).map((row) => {
          const u = Array.isArray(row.user) ? row.user[0] : row.user;
          return {
            user_id: row.user_id,
            joined_at: row.joined_at,
            firstname: u?.firstname ?? null,
            lastname: u?.lastname ?? null,
            email: u?.email ?? '',
            platform_role: u?.platform_role ?? 'none',
          };
        }) as Participant[];
        setParticipants(normalised);
      }
    } catch (err) {
      console.error('Exception fetching participants:', err);
    } finally {
      setLoading(false);
    }
  }, [chatRoomId]);

  // ── Fetch mentors NOT already in this room ───────────────────────────────

  const fetchAvailableMentors = useCallback(async () => {
    if (!chatRoomId) return;

    try {
      // Get existing participant user_ids
      const { data: existingRows } = await supabase
        .from('chat_participants')
        .select('user_id')
        .eq('room_id', chatRoomId);

      const existingIds = (existingRows ?? []).map((r) => r.user_id);

      // Fetch mentors not in the room
      let query = supabase
        .from('users')
        .select('user_id, firstname, lastname, email')
        .eq('platform_role', 'mentor');

      if (existingIds.length > 0) {
        // Supabase's .not('col', 'in', value) expects a stringified tuple
        query = query.not('user_id', 'in', `(${existingIds.join(',')})`);
      }

      const { data, error } = await query.order('firstname', { ascending: true });

      if (error) {
        console.error('Error fetching mentors:', error.message);
      } else {
        setAvailableMentors(data ?? []);
      }
    } catch (err) {
      console.error('Exception fetching mentors:', err);
    }
  }, [chatRoomId]);

  // ── Add mentor to room ───────────────────────────────────────────────────

  const handleAddMentor = async () => {
    if (!selectedMentorId || !chatRoomId) return;
    setAdding(true);
    setMessage(null);

    try {
      const { error } = await supabase.from('chat_participants').insert({
        room_id: chatRoomId,
        user_id: selectedMentorId,
      });

      if (error) {
        console.error('Error adding mentor:', error.message);
        setMessage({ text: `Failed to add mentor: ${error.message}`, type: 'error' });
      } else {
        setMessage({ text: 'Mentor added successfully!', type: 'success' });
        setSelectedMentorId('');
        // Refresh both lists
        await fetchParticipants();
        await fetchAvailableMentors();
      }
    } catch (err) {
      console.error('Exception adding mentor:', err);
      setMessage({ text: 'An unexpected error occurred.', type: 'error' });
    } finally {
      setAdding(false);
    }
  };

  // ── Remove participant from room ─────────────────────────────────────────

  const handleRemove = async (userId: string) => {
    setRemovingId(userId);
    setMessage(null);

    try {
      const { error } = await supabase
        .from('chat_participants')
        .delete()
        .eq('room_id', chatRoomId)
        .eq('user_id', userId);

      if (error) {
        console.error('Error removing participant:', error.message);
        setMessage({ text: `Failed to remove: ${error.message}`, type: 'error' });
      } else {
        setMessage({ text: 'Participant removed.', type: 'success' });
        await fetchParticipants();
        await fetchAvailableMentors();
      }
    } catch (err) {
      console.error('Exception removing participant:', err);
      setMessage({ text: 'An unexpected error occurred.', type: 'error' });
    } finally {
      setRemovingId(null);
    }
  };

  // ── Fetch data when modal opens ──────────────────────────────────────────

  useEffect(() => {
    if (open && chatRoomId) {
      fetchParticipants();
      fetchAvailableMentors();
      setMessage(null);
      setSelectedMentorId('');
    }
  }, [open, chatRoomId, fetchParticipants, fetchAvailableMentors]);

  // ── Helpers ──────────────────────────────────────────────────────────────

  const getInitials = (firstname: string | null, lastname: string | null) => {
    const f = firstname?.[0]?.toUpperCase() ?? '';
    const l = lastname?.[0]?.toUpperCase() ?? '';
    return f + l || '?';
  };

  const getName = (firstname: string | null, lastname: string | null) => {
    const full = `${firstname ?? ''} ${lastname ?? ''}`.trim();
    return full || 'Unknown';
  };

  const getRoleBadgeClass = (role: string) => {
    switch (role) {
      case 'mentor':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'student':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      default:
        return 'bg-neutral-500/10 text-neutral-400 border-neutral-500/20';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0a0a0a]/95 backdrop-blur-xl text-neutral-200 border border-white/[0.06] shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-amber-400" />
            Manage Participants
          </DialogTitle>
          <DialogDescription className="text-neutral-400">
            {chatRoomName} — Add or remove mentors from this 1-on-1 chat room.
          </DialogDescription>
        </DialogHeader>

        {/* ── Add Mentor Section ────────────────────────────────────────── */}
        <div className="space-y-3">
          <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
            Add a Mentor
          </label>
          <div className="flex gap-2">
            <Select
              value={selectedMentorId}
              onValueChange={setSelectedMentorId}
            >
              <SelectTrigger className="flex-1 border-white/[0.08] bg-white/[0.03] text-neutral-200 focus:ring-amber-500/30">
                <SelectValue placeholder="Select a mentor…" />
              </SelectTrigger>
              <SelectContent className="border-white/[0.08] bg-[#0a0a0a]/95 backdrop-blur-xl">
                {availableMentors.length === 0 ? (
                  <div className="px-3 py-4 text-center">
                    <Search className="w-4 h-4 text-neutral-600 mx-auto mb-1" />
                    <p className="text-xs text-neutral-500">No mentors available to add.</p>
                  </div>
                ) : (
                  availableMentors.map((m) => (
                    <SelectItem
                      key={m.user_id}
                      value={m.user_id}
                      className="rounded-lg hover:bg-white/[0.04]"
                    >
                      <span className="text-neutral-200">
                        {getName(m.firstname, m.lastname)}
                      </span>
                      <span className="text-neutral-500 ml-2 text-xs">{m.email}</span>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <Button
              onClick={handleAddMentor}
              disabled={!selectedMentorId || adding}
              className="bg-amber-500/10 text-amber-400 font-medium border border-amber-500/20 hover:bg-amber-500/20 hover:border-amber-500/30 transition-all duration-300 shrink-0"
            >
              {adding ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <UserPlus className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>

        {/* ── Feedback Message ──────────────────────────────────────────── */}
        {message && (
          <p
            className={`text-xs px-1 ${
              message.type === 'success' ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {message.text}
          </p>
        )}

        {/* ── Participants List ─────────────────────────────────────────── */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
            Current Participants ({participants.length})
          </label>
          <ScrollArea className="max-h-[280px]">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-5 h-5 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
              </div>
            ) : participants.length === 0 ? (
              <p className="text-center text-neutral-500 text-sm py-6">
                No participants in this room.
              </p>
            ) : (
              <div className="space-y-1">
                {participants.map((p) => (
                  <div
                    key={p.user_id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] transition-colors group"
                  >
                    {/* Avatar */}
                    <Avatar className="w-8 h-8 shrink-0">
                      <AvatarFallback className="text-[10px] font-semibold bg-white/[0.06] text-neutral-400">
                        {getInitials(p.firstname, p.lastname)}
                      </AvatarFallback>
                    </Avatar>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-neutral-200 truncate">
                        {getName(p.firstname, p.lastname)}
                      </p>
                      <p className="text-[11px] text-neutral-500 truncate">{p.email}</p>
                    </div>

                    {/* Role badge */}
                    <span
                      className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border shrink-0 ${getRoleBadgeClass(p.platform_role)}`}
                    >
                      {p.platform_role}
                    </span>

                    {/* Remove button (mentors only) */}
                    {p.platform_role === 'mentor' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemove(p.user_id)}
                        disabled={removingId === p.user_id}
                        className="opacity-0 group-hover:opacity-100 text-rose-400/70 hover:text-rose-400 hover:bg-rose-500/10 transition-all duration-200 h-7 w-7 p-0 shrink-0"
                      >
                        {removingId === p.user_id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
