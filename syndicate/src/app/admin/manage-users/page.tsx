'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@lib/auth';
import { supabase } from '@lib/supabase/client';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/glass-card';
import { StatusPill } from '@/components/ui/status-pill';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Check, Plus, Loader2, Users, Settings2, CalendarClock } from 'lucide-react';
import ManageChatMentorsModal from '@/components/ManageChatMentorsModal';

// ─── Types ───────────────────────────────────────────────────────────────────

interface User {
  user_id: string;
  email: string;
  firstname: string | null;
  lastname: string | null;
  role: string;
  platform_role: 'student' | 'mentor' | 'none';
  has_1on1_membership: boolean;
  membership_end_date: string | null;
  company: { name: string } | null;
}

interface ChatRoom1on1 {
  id: string;
  name: string;
  type: string;
  created_at: string;
  // Which student owns this room (derived from participants)
  student_user_id?: string;
  student_name?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ManageUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string>('');
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  // Membership duration selection state
  const [pendingMembershipUserId, setPendingMembershipUserId] = useState<string | null>(null);
  const [pendingDuration, setPendingDuration] = useState<string>('');

  // 1-on-1 room management
  const [oneOnOneRooms, setOneOnOneRooms] = useState<ChatRoom1on1[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [managingRoom, setManagingRoom] = useState<ChatRoom1on1 | null>(null);

  const { isAuthenticated, loading: authLoading, user } = useAuth();
  const router = useRouter();

  // ── Fetch users ──────────────────────────────────────────────────────────

  const fetchUsers = useCallback(async () => {
    const { data, error } = await supabase
      .from('users')
      .select(`
        user_id,
        email,
        firstname,
        lastname,
        role,
        platform_role,
        has_1on1_membership,
        membership_end_date,
        company (name)
      `)
      .order('firstname', { ascending: true });

    if (error) {
      console.error('Error fetching users:', error);
      setMessage('Failed to load users.');
    } else {
      const transformedUsers = (data || []).map((u) => ({
        ...u,
        company: Array.isArray(u.company) && u.company.length > 0 ? u.company[0] : null,
      })) as User[];
      setUsers(transformedUsers);
    }
    setLoading(false);
  }, []);

  // ── Fetch 1-on-1 chat rooms ──────────────────────────────────────────────

  const fetchOneOnOneRooms = useCallback(async () => {
    setLoadingRooms(true);
    try {
      const { data: rooms, error } = await supabase
        .from('chat_rooms')
        .select('id, name, type, created_at')
        .eq('type', '1on1')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching 1on1 rooms:', error.message);
      } else {
        // For each room, try to find the student participant
        const enrichedRooms: ChatRoom1on1[] = [];
        for (const room of rooms ?? []) {
          const { data: participants } = await supabase
            .from('chat_participants')
            .select(`
              user_id,
              user:users!chat_participants_user_id_fkey (
                firstname,
                lastname,
                platform_role
              )
            `)
            .eq('room_id', room.id);

          const studentParticipant = (participants ?? []).find((p) => {
            const u = Array.isArray(p.user) ? p.user[0] : p.user;
            return u?.platform_role === 'student';
          });

          const studentUser = studentParticipant
            ? (Array.isArray(studentParticipant.user) ? studentParticipant.user[0] : studentParticipant.user)
            : null;

          enrichedRooms.push({
            ...room,
            student_user_id: studentParticipant?.user_id,
            student_name: studentUser
              ? `${studentUser.firstname ?? ''} ${studentUser.lastname ?? ''}`.trim() || 'Unknown'
              : 'No student',
          });
        }
        setOneOnOneRooms(enrichedRooms);
      }
    } catch (err) {
      console.error('Exception fetching rooms:', err);
    } finally {
      setLoadingRooms(false);
    }
  }, []);

  // ── Update platform_role ─────────────────────────────────────────────────

  const updatePlatformRole = async (userId: string, newRole: string) => {
    setUpdatingUserId(userId);
    setMessage('');

    const { error } = await supabase
      .from('users')
      .update({ platform_role: newRole })
      .eq('user_id', userId);

    if (error) {
      console.error('Error updating platform_role:', error.message);
      setMessage(`Failed to update role: ${error.message}`);
    } else {
      setUsers((prev) =>
        prev.map((u) =>
          u.user_id === userId ? { ...u, platform_role: newRole as User['platform_role'] } : u,
        ),
      );
      setMessage('Platform role updated.');
    }
    setUpdatingUserId(null);
  };

  // ── Membership activation with duration ──────────────────────────────────

  const calculateEndDate = (months: number): string => {
    const date = new Date();
    date.setMonth(date.getMonth() + months);
    return date.toISOString();
  };

  const handleMembershipToggle = (userId: string, currentValue: boolean) => {
    if (currentValue) {
      // Turning OFF: immediately deactivate
      deactivateMembership(userId);
    } else {
      // Turning ON: show the duration picker
      setPendingMembershipUserId(userId);
      setPendingDuration('');
    }
  };

  const activateMembership = async (userId: string, durationMonths: number) => {
    setUpdatingUserId(userId);
    setMessage('');

    const endDate = calculateEndDate(durationMonths);

    const { error } = await supabase
      .from('users')
      .update({
        has_1on1_membership: true,
        membership_end_date: endDate,
      })
      .eq('user_id', userId);

    if (error) {
      console.error('Error activating membership:', error.message);
      setMessage(`Failed to activate membership: ${error.message}`);
    } else {
      setUsers((prev) =>
        prev.map((u) =>
          u.user_id === userId
            ? { ...u, has_1on1_membership: true, membership_end_date: endDate }
            : u,
        ),
      );
      setMessage('1-on-1 membership activated.');
      // Refresh rooms if a student was activated (trigger may have created a room)
      const targetUser = users.find((u) => u.user_id === userId);
      if (targetUser?.platform_role === 'student') {
        setTimeout(() => fetchOneOnOneRooms(), 1000);
      }
    }
    setUpdatingUserId(null);
    setPendingMembershipUserId(null);
    setPendingDuration('');
  };

  const deactivateMembership = async (userId: string) => {
    setUpdatingUserId(userId);
    setMessage('');

    const { error } = await supabase
      .from('users')
      .update({
        has_1on1_membership: false,
        membership_end_date: null,
      })
      .eq('user_id', userId);

    if (error) {
      console.error('Error deactivating membership:', error.message);
      setMessage(`Failed to deactivate membership: ${error.message}`);
    } else {
      setUsers((prev) =>
        prev.map((u) =>
          u.user_id === userId
            ? { ...u, has_1on1_membership: false, membership_end_date: null }
            : u,
        ),
      );
      setMessage('1-on-1 membership deactivated.');
    }
    setUpdatingUserId(null);
  };

  const handleDurationSelect = (value: string) => {
    setPendingDuration(value);
    if (pendingMembershipUserId) {
      const months = parseInt(value, 10);
      activateMembership(pendingMembershipUserId, months);
    }
  };

  const cancelPendingMembership = () => {
    setPendingMembershipUserId(null);
    setPendingDuration('');
  };

  // ── Format membership expiry for display ─────────────────────────────────

  const formatMembershipExpiry = (endDate: string | null, isActive: boolean) => {
    if (!isActive || !endDate) return null;

    const date = new Date(endDate);
    const now = new Date();
    const isExpired = date <= now;

    const formatted = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    return { formatted, isExpired };
  };

  // ── Generate invite code ─────────────────────────────────────────────────

  const generateInviteCode = useCallback(async () => {
    setMessage('');

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('user_id')
      .eq('user_id', user?.user_id)
      .single();

    if (userError || !userData) {
      console.error('Error fetching user ID:', userError);
      setMessage('Failed to identify current user.');
      setInviteCode(null);
      return;
    }

    const createdUserId = userData.user_id;
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const maxAttempts = 5;
    let attempts = 0;

    try {
      while (attempts < maxAttempts) {
        let code = '';
        for (let i = 0; i < 5; i++) {
          code += characters.charAt(Math.floor(Math.random() * characters.length));
        }

        const { data, error } = await supabase
          .from('invitation_codes')
          .insert({
            code,
            expired: false,
            created_user_id: createdUserId,
          })
          .select('code')
          .single();

        if (error) {
          if (error.code === '23505') {
            console.log(`Code ${code} already exists, retrying...`);
            attempts++;
            continue;
          }
          console.error('Error creating invite code:', error);
          setMessage(`Failed to generate invite code: ${error.message}`);
          setInviteCode(null);
          return;
        }

        if (data) {
          setInviteCode(data.code);
          setMessage('Invite code generated successfully!');
          return;
        }
      }

      setMessage('Failed to generate a unique invite code after multiple attempts.');
      setInviteCode(null);
    } catch (error) {
      console.error('Unexpected error:', error);
      setMessage('An unexpected error occurred');
      setInviteCode(null);
    }
  }, [user?.user_id]);

  // ── Auth guard & initial fetch ───────────────────────────────────────────

  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    if (user?.role !== 'admin') {
      router.push('/dashboard');
      return;
    }

    fetchUsers();
    fetchOneOnOneRooms();
  }, [isAuthenticated, authLoading, router, user?.role, fetchUsers, fetchOneOnOneRooms]);

  // ── Loading / guard ──────────────────────────────────────────────────────

  if (authLoading || loading) {
    return (
      <div className="min-h-screen p-6 flex items-center justify-center">
        <p className="text-neutral-400">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated || user?.role !== 'admin') return null;


  return (
    <div className="min-h-screen p-6 w-full">
      <div className="mx-auto">
        <h1 className="text-3xl font-bold text-white mb-6">Manage Users</h1>

        {/* Global feedback */}
        {message && (
          <div className="mb-4">
            <p
              className={`text-sm ${
                message.includes('successfully') || message.includes('updated') || message.includes('activated') || message.includes('deactivated')
                  ? 'text-emerald-400'
                  : 'text-rose-400'
              }`}
            >
              {message}
            </p>
          </div>
        )}

        {/* Invite Code Section */}
        <GlassCard className="p-6 mb-8">
          <div className="mb-4">
            <h3 className="font-semibold text-white">Invite Users</h3>
          </div>
          <Button
            onClick={generateInviteCode}
            className="bg-amber-500/10 text-amber-400 font-medium border border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.05)] hover:bg-amber-500/20 hover:shadow-[0_0_20px_rgba(245,158,11,0.1)] hover:border-amber-500/30 transition-all duration-300 mb-4"
          >
            <Plus className="mr-2 h-4 w-4" />
            Generate Invite Code
          </Button>
          {inviteCode && (
            <Alert className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 w-fit backdrop-blur-md">
              <Check className="h-4 w-4 text-emerald-400" />
              <AlertTitle className="text-emerald-300">New Invite Code</AlertTitle>
              <AlertDescription>
                <span className="font-mono text-lg text-white">{inviteCode}</span>
                <p className="mt-1 text-emerald-400/80">
                  Share this code with the user to allow signup.
                </p>
              </AlertDescription>
            </Alert>
          )}
        </GlassCard>

        {/* Users Table */}
        <GlassCard className="mb-8">
          <div className="p-6 pb-2">
            <h3 className="font-semibold text-white">All Users</h3>
            <p className="text-sm text-neutral-500 mt-1">
              Manage platform roles and 1-on-1 memberships.
            </p>
          </div>
          <div className="p-6 pt-0 overflow-x-auto">
            {users.length === 0 ? (
              <p className="text-neutral-500 text-center">No users found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-white/[0.05] hover:bg-transparent">
                    <TableHead className="text-neutral-400">Name</TableHead>
                    <TableHead className="text-neutral-400">Email</TableHead>
                    <TableHead className="text-neutral-400">Role</TableHead>
                    <TableHead className="text-neutral-400">Platform Role</TableHead>
                    <TableHead className="text-neutral-400">1-on-1 Membership</TableHead>
                    <TableHead className="text-neutral-400">Membership Expiry</TableHead>
                    <TableHead className="text-neutral-400">Company</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow
                      key={u.user_id}
                      className="hover:bg-white/[0.02] transition-colors border-b border-white/[0.02]"
                    >
                      {/* Name */}
                      <TableCell className="text-neutral-200 font-medium">
                        {u.firstname || u.lastname
                          ? `${u.firstname || ''} ${u.lastname || ''}`.trim()
                          : 'N/A'}
                      </TableCell>

                      {/* Email */}
                      <TableCell className="text-neutral-400 text-sm">{u.email}</TableCell>

                      {/* System Role */}
                      <TableCell>
                        <StatusPill text={u.role} type={u.role} />
                      </TableCell>

                      {/* Platform Role dropdown */}
                      <TableCell>
                        <Select
                          value={u.platform_role}
                          onValueChange={(val) => updatePlatformRole(u.user_id, val)}
                          disabled={updatingUserId === u.user_id}
                        >
                          <SelectTrigger className="w-[130px] h-8 text-xs border-white/[0.08] bg-white/[0.03]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="border-white/[0.08] bg-[#0a0a0a]/95 backdrop-blur-xl">
                            <SelectItem value="none" className="rounded-lg hover:bg-white/[0.04]">
                              <span className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-neutral-500" />
                                None
                              </span>
                            </SelectItem>
                            <SelectItem value="student" className="rounded-lg hover:bg-white/[0.04]">
                              <span className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                                Student
                              </span>
                            </SelectItem>
                            <SelectItem value="mentor" className="rounded-lg hover:bg-white/[0.04]">
                              <span className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                Mentor
                              </span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>

                      {/* 1-on-1 Membership Toggle + Duration */}
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            id={`membership-${u.user_id}`}
                            checked={u.has_1on1_membership}
                            onCheckedChange={() => handleMembershipToggle(u.user_id, u.has_1on1_membership)}
                            disabled={updatingUserId === u.user_id}
                            className="data-[state=checked]:bg-amber-500"
                          />
                          {/* Duration picker — shown when toggling ON */}
                          {pendingMembershipUserId === u.user_id && (
                            <div className="flex items-center gap-1.5">
                              <Select
                                value={pendingDuration}
                                onValueChange={handleDurationSelect}
                              >
                                <SelectTrigger className="w-[120px] h-7 text-[11px] border-amber-500/20 bg-amber-500/5 text-amber-300 animate-in fade-in duration-200">
                                  <SelectValue placeholder="Duration…" />
                                </SelectTrigger>
                                <SelectContent className="border-white/[0.08] bg-[#0a0a0a]/95 backdrop-blur-xl">
                                  <SelectItem value="3" className="rounded-lg hover:bg-white/[0.04]">
                                    3 Months
                                  </SelectItem>
                                  <SelectItem value="6" className="rounded-lg hover:bg-white/[0.04]">
                                    6 Months
                                  </SelectItem>
                                  <SelectItem value="12" className="rounded-lg hover:bg-white/[0.04]">
                                    1 Year
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                              <button
                                onClick={cancelPendingMembership}
                                className="text-neutral-500 hover:text-neutral-300 text-xs transition-colors"
                              >
                                ✕
                              </button>
                            </div>
                          )}
                          {updatingUserId === u.user_id && (
                            <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                          )}
                        </div>
                      </TableCell>

                      {/* Membership Expiry */}
                      <TableCell>
                        {(() => {
                          const expiry = formatMembershipExpiry(u.membership_end_date, u.has_1on1_membership);
                          if (!u.has_1on1_membership) {
                            return <span className="text-neutral-600 text-xs">—</span>;
                          }
                          if (!expiry) {
                            return <span className="text-neutral-500 text-xs">No date set</span>;
                          }
                          return (
                            <div className="flex items-center gap-1.5">
                              <CalendarClock className={`w-3.5 h-3.5 shrink-0 ${expiry.isExpired ? 'text-rose-400' : 'text-emerald-400'}`} />
                              <span
                                className={`text-xs font-medium ${
                                  expiry.isExpired
                                    ? 'text-rose-400'
                                    : 'text-neutral-300'
                                }`}
                              >
                                {expiry.isExpired ? 'Expired' : `Expires ${expiry.formatted}`}
                              </span>
                            </div>
                          );
                        })()}
                      </TableCell>

                      {/* Company */}
                      <TableCell className="text-neutral-400 text-sm">
                        {u.company?.name || 'N/A'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </GlassCard>

        {/* 1-on-1 Chat Rooms Section */}
        <GlassCard>
          <div className="p-6 pb-2">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-amber-400" />
              1-on-1 Chat Rooms
            </h3>
            <p className="text-sm text-neutral-500 mt-1">
              Manage mentor assignments in student 1-on-1 rooms.
            </p>
          </div>
          <div className="p-6 pt-0">
            {loadingRooms ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-5 h-5 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
              </div>
            ) : oneOnOneRooms.length === 0 ? (
              <p className="text-neutral-500 text-center py-6">
                No 1-on-1 rooms have been created yet.
              </p>
            ) : (
              <div className="grid gap-3">
                {oneOnOneRooms.map((room) => (
                  <div
                    key={room.id}
                    className="flex items-center gap-4 px-4 py-3 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.03] transition-colors"
                  >
                    {/* Room icon */}
                    <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                      <Users className="w-4 h-4 text-amber-400" />
                    </div>

                    {/* Room info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-neutral-200 truncate">{room.name}</p>
                      <p className="text-[11px] text-neutral-500">
                        Student: {room.student_name ?? 'N/A'} · Created{' '}
                        {new Date(room.created_at).toLocaleDateString()}
                      </p>
                    </div>

                    {/* Manage button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setManagingRoom(room)}
                      className="text-amber-400/70 hover:text-amber-400 hover:bg-amber-500/10 transition-all duration-200 text-xs"
                    >
                      <Settings2 className="w-3.5 h-3.5 mr-1.5" />
                      Manage
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </GlassCard>

        {/* ── Modal for managing chat participants ──────────────────────── */}
        {managingRoom && (
          <ManageChatMentorsModal
            open={!!managingRoom}
            onOpenChange={(open) => {
              if (!open) {
                setManagingRoom(null);
                fetchOneOnOneRooms(); // Refresh room data after closing
              }
            }}
            chatRoomId={managingRoom.id}
            chatRoomName={managingRoom.name}
          />
        )}
      </div>
    </div>
  );
}