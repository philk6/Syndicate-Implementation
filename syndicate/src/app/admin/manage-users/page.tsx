'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@lib/auth';
import { supabase } from '@lib/supabase/client';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Check, Plus, Loader2, Users, Settings2, CalendarClock, Pencil, UserPlus } from 'lucide-react';
import Link from 'next/link';
import ManageChatMentorsModal from '@/components/ManageChatMentorsModal';
import { CompanyProfileDrawer } from '@/components/CompanyProfileDrawer';
import { LoadingSpinner, PageLoadingSpinner } from '@/components/ui/loading-spinner';
import {
  PageShell, PageHeader, SectionLabel, DsCard,
  DsTable, DsThead, DsTh, DsTr, DsTd, DsButton, DsInput, DsEmpty, DsCountPill, DS,
} from '@/components/ui/ds';

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
  company_id: number | null;
  buyersgroup: boolean;
  is_one_on_one_student: boolean;
}

interface ChatRoom1on1 {
  id: string;
  name: string;
  type: string;
  created_at: string;
  student_user_id?: string;
  student_name?: string;
}

const ROLE_COLOR: Record<string, string> = {
  admin: DS.orange,
  user: DS.blue,
  mentor: '#4ade80',
  student: DS.teal,
  employee: DS.gold,
  va: DS.teal,
};

const SYSTEM_ROLES = ['user', 'admin', 'employee', 'va'] as const;
type SystemRole = (typeof SYSTEM_ROLES)[number];

interface TeamOwnerOption {
  team_id: string;
  team_name: string;
  owner_user_id: string;
  owner_name: string;
  owner_email: string;
}

// What the confirmation modal shows for each transition. Picked by the
// to-role first, then refined by the from-role for "demote from admin".
function modalCopy(opts: {
  fromRole: SystemRole;
  toRole: SystemRole;
  fullName: string;
}): { title: string; body: string } {
  const { fromRole, toRole, fullName } = opts;
  const name = fullName || 'This user';

  if (toRole === 'admin') {
    return {
      title: 'Promote to Admin?',
      body: `${name} will get full admin access to Syndicate, including Manage Users, Manage Orders, Credit Dashboard, and all teams. This is a powerful role.`,
    };
  }
  if (fromRole === 'admin') {
    return {
      title: 'Demote from Admin?',
      body: `${name} will lose admin access. They will no longer see Manage Users, Manage Orders, Credit Dashboard, or other teams. Their time entry history is preserved.`,
    };
  }
  if (toRole === 'employee') {
    return {
      title: 'Convert to Employee?',
      body: `${name} becomes a warehouse employee. They will be added to the Warehouse team and able to clock in via My Time. Their existing data is preserved.`,
    };
  }
  if (toRole === 'va') {
    return {
      title: 'Convert to VA?',
      body: `${name} becomes a VA. You must assign them to a team owner (one-on-one student) before they can clock in. Continue?`,
    };
  }
  // Default → user
  return {
    title: 'Reset to Regular User?',
    body: `${name} becomes a regular user. If they were a VA or employee, they will be removed from their current team but their time entry history stays in place. Continue?`,
  };
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ManageUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState('');
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string>('');
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  // Membership duration selection state
  const [pendingMembershipUserId, setPendingMembershipUserId] = useState<string | null>(null);
  const [pendingDuration, setPendingDuration] = useState<string>('');
  const [pendingStartDate, setPendingStartDate] = useState<string>('');
  const [editingMembershipUserId, setEditingMembershipUserId] = useState<string | null>(null);
  const [editingDuration, setEditingDuration] = useState<string>('');
  const [editingStartDate, setEditingStartDate] = useState<string>('');

  // 1-on-1 room management
  const [oneOnOneRooms, setOneOnOneRooms] = useState<ChatRoom1on1[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [managingRoom, setManagingRoom] = useState<ChatRoom1on1 | null>(null);

  // System-role change confirmation modal state.
  const [roleModal, setRoleModal] = useState<{
    user: User; toRole: SystemRole; teamId: string;
  } | null>(null);
  const [roleModalSubmitting, setRoleModalSubmitting] = useState(false);
  const [roleModalError, setRoleModalError] = useState<string | null>(null);
  // Teams owned by one-on-one students — populated lazily when an admin
  // first opens a "convert to VA" modal so we don't hit the DB on every load.
  const [vaTeamOptions, setVaTeamOptions] = useState<TeamOwnerOption[] | null>(null);
  const [vaTeamOptionsLoading, setVaTeamOptionsLoading] = useState(false);

  const { isAuthenticated, loading: authLoading, user } = useAuth();
  const router = useRouter();

  // ── Fetch users ──────────────────────────────────────────────────────────

  const fetchUsers = useCallback(async () => {
    const { data, error } = await supabase
      .from('users')
      .select(`
        user_id,
        email,
        is_one_on_one_student,
        firstname,
        lastname,
        role,
        platform_role,
        has_1on1_membership,
        membership_end_date,
        buyersgroup,
        company_id,
        company (name)
      `)
      .order('firstname', { ascending: true });

    if (error) {
      console.error('Error fetching users:', error);
      setMessage('Failed to load users.');
    } else {
      const transformedUsers = (data || []).map((u) => ({
        ...u,
        company_id: u.company_id ?? null,
        company: Array.isArray(u.company)
          ? u.company.length > 0 ? u.company[0] : null
          : u.company ?? null,
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

  // ── Update users.role (system role) ──────────────────────────────────────

  const loadVaTeamOptions = useCallback(async () => {
    if (vaTeamOptions || vaTeamOptionsLoading) return;
    setVaTeamOptionsLoading(true);
    const { data, error } = await supabase
      .from('users')
      .select('user_id, firstname, lastname, email, is_one_on_one_student, teams!teams_owner_id_fkey(id, name, is_warehouse)')
      .eq('is_one_on_one_student', true);
    if (error) {
      console.error('Failed to fetch one-on-one student teams:', error.message);
      setVaTeamOptionsLoading(false);
      return;
    }
    const opts: TeamOwnerOption[] = [];
    for (const u of data ?? []) {
      const teams = Array.isArray(u.teams) ? u.teams : [];
      for (const t of teams) {
        if (!t || (t as { is_warehouse?: boolean }).is_warehouse) continue;
        opts.push({
          team_id: (t as { id: string }).id,
          team_name: (t as { name: string }).name,
          owner_user_id: u.user_id as string,
          owner_name: `${u.firstname ?? ''} ${u.lastname ?? ''}`.trim() || (u.email as string).split('@')[0],
          owner_email: u.email as string,
        });
      }
    }
    opts.sort((a, b) => a.owner_name.localeCompare(b.owner_name));
    setVaTeamOptions(opts);
    setVaTeamOptionsLoading(false);
  }, [vaTeamOptions, vaTeamOptionsLoading]);

  const requestRoleChange = (target: User, toRole: SystemRole) => {
    if (target.role === toRole) return;
    setRoleModalError(null);
    setRoleModal({ user: target, toRole, teamId: '' });
    if (toRole === 'va') void loadVaTeamOptions();
  };

  const submitRoleChange = async () => {
    if (!roleModal) return;
    if (roleModal.toRole === 'va' && !roleModal.teamId) {
      setRoleModalError('Pick a team owner before continuing.');
      return;
    }
    setRoleModalSubmitting(true);
    setRoleModalError(null);
    try {
      const res = await fetch(`/api/admin/users/${roleModal.user.user_id}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: roleModal.toRole,
          team_id: roleModal.toRole === 'va' ? roleModal.teamId : undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setRoleModalError(json.error ?? 'Role change failed.');
        return;
      }
      // Optimistic: update the row locally so the badge flips before refetch.
      setUsers((prev) => prev.map((u) =>
        u.user_id === roleModal.user.user_id ? { ...u, role: roleModal.toRole } : u,
      ));
      setMessage(`Role updated to ${roleModal.toRole}.`);
      setRoleModal(null);
      // Best-effort refetch to pick up any server-side reconciliations.
      void fetchUsers();
    } catch (err) {
      setRoleModalError(err instanceof Error ? err.message : 'Role change failed.');
    } finally {
      setRoleModalSubmitting(false);
    }
  };

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

  const calculateEndDate = (months: number, startDateStr?: string): string => {
    const date = startDateStr ? new Date(startDateStr + 'T00:00:00') : new Date();
    date.setMonth(date.getMonth() + months);
    return date.toISOString();
  };

  const handleMembershipToggle = (userId: string, currentValue: boolean) => {
    if (currentValue) {
      deactivateMembership(userId);
    } else {
      setPendingMembershipUserId(userId);
      setPendingDuration('');
      setPendingStartDate(new Date().toISOString().split('T')[0]);
    }
  };

  const activateMembership = async (userId: string, durationMonths: number, startDate?: string) => {
    setUpdatingUserId(userId);
    setMessage('');

    const endDate = calculateEndDate(durationMonths, startDate);

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
  };

  const confirmActivation = () => {
    if (pendingMembershipUserId && pendingDuration) {
      const months = parseInt(pendingDuration, 10);
      activateMembership(pendingMembershipUserId, months, pendingStartDate);
    }
  };

  const cancelPendingMembership = () => {
    setPendingMembershipUserId(null);
    setPendingDuration('');
    setPendingStartDate('');
  };

  // ── Edit existing membership dates ──────────────────────────────────────

  const startEditingMembership = (userId: string) => {
    setEditingMembershipUserId(userId);
    setEditingStartDate(new Date().toISOString().split('T')[0]);
    setEditingDuration('');
  };

  const cancelEditingMembership = () => {
    setEditingMembershipUserId(null);
    setEditingDuration('');
    setEditingStartDate('');
  };

  const confirmEditMembership = async () => {
    if (!editingMembershipUserId || !editingDuration || !editingStartDate) return;

    setUpdatingUserId(editingMembershipUserId);
    setMessage('');

    const months = parseInt(editingDuration, 10);
    const endDate = calculateEndDate(months, editingStartDate);

    const { error } = await supabase
      .from('users')
      .update({ membership_end_date: endDate })
      .eq('user_id', editingMembershipUserId);

    if (error) {
      console.error('Error updating membership dates:', error.message);
      setMessage(`Failed to update membership dates: ${error.message}`);
    } else {
      setUsers((prev) =>
        prev.map((u) =>
          u.user_id === editingMembershipUserId
            ? { ...u, membership_end_date: endDate }
            : u,
        ),
      );
      setMessage('Membership dates updated.');
    }
    setUpdatingUserId(null);
    cancelEditingMembership();
  };

  // ── Toggle one-on-one student flag (auto-creates a team on first ON) ────

  const handleStudentFlagToggle = async (userId: string, currentStatus: boolean) => {
    setUsers((prev) =>
      prev.map((u) => (u.user_id === userId ? { ...u, is_one_on_one_student: !currentStatus } : u)),
    );
    setUpdatingUserId(userId);
    setMessage('');
    try {
      const res = await fetch(`/api/admin/users/${userId}/student-flag`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_one_on_one_student: !currentStatus }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage(`Failed to update student flag: ${json.error ?? 'unknown'}`);
        setUsers((prev) =>
          prev.map((u) => (u.user_id === userId ? { ...u, is_one_on_one_student: currentStatus } : u)),
        );
      } else {
        setMessage(
          !currentStatus
            ? 'Marked as one-on-one student — team auto-created.'
            : 'Unmarked. Existing team preserved for records.',
        );
      }
    } catch (err) {
      console.error('[student-flag] failed', err);
      setUsers((prev) =>
        prev.map((u) => (u.user_id === userId ? { ...u, is_one_on_one_student: currentStatus } : u)),
      );
      setMessage(`Failed to update student flag: ${err instanceof Error ? err.message : 'network'}`);
    } finally {
      setUpdatingUserId(null);
    }
  };

  // ── Toggle buyers group access ───────────────────────────────────────────

  const handleBuyersGroupToggle = async (userId: string, currentStatus: boolean) => {
    setUsers((prev) =>
      prev.map((u) =>
        u.user_id === userId ? { ...u, buyersgroup: !currentStatus } : u,
      ),
    );
    setUpdatingUserId(userId);
    setMessage('');

    const { error } = await supabase
      .from('users')
      .update({ buyersgroup: !currentStatus })
      .eq('user_id', userId);

    if (error) {
      console.error('Error updating buyersgroup:', error.message);
      setMessage(`Failed to update buyers group access: ${error.message}`);
      setUsers((prev) =>
        prev.map((u) =>
          u.user_id === userId ? { ...u, buyersgroup: currentStatus } : u,
        ),
      );
    } else {
      setMessage('Buyers group access updated.');
    }
    setUpdatingUserId(null);
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
    return <PageLoadingSpinner />;
  }

  if (!isAuthenticated || user?.role !== 'admin') return null;

  // ── Filtered users ──────────────────────────────────────────────────────

  const filteredUsers = users.filter((u) => {
    const q = search.toLowerCase();
    if (!q) return true;
    const name = `${u.firstname || ''} ${u.lastname || ''}`.toLowerCase();
    return name.includes(q) || u.email.toLowerCase().includes(q) || u.role.toLowerCase().includes(q);
  });

  return (
    <PageShell>
      <PageHeader
        title="MANAGE USERS"
        subtitle={`${users.length} registered users`}
        right={
          <div className="flex items-center gap-2 flex-wrap">
            <Link href="/admin/manage-users/new-employee">
              <DsButton variant="secondary" accent={DS.teal}>
                <UserPlus className="w-3.5 h-3.5" /> Create Employee
              </DsButton>
            </Link>
            <DsButton onClick={generateInviteCode} accent={DS.orange}>
              <Plus className="w-3.5 h-3.5" /> Generate Invite Code
            </DsButton>
          </div>
        }
      />

      {/* Global feedback */}
      {message && (
        <p
          className={`text-sm font-mono ${
            message.includes('successfully') || message.includes('updated') || message.includes('activated') || message.includes('deactivated')
              ? 'text-emerald-400'
              : 'text-rose-400'
          }`}
        >
          {message}
        </p>
      )}

      {/* Invite Code Display */}
      {inviteCode && (
        <DsCard accent="#4ade80" className="p-5">
          <div className="flex items-center gap-3">
            <Check className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400/80 mb-1">New Invite Code</p>
              <p className="font-mono text-lg text-white">{inviteCode}</p>
              <p className="text-xs text-neutral-500 mt-0.5">Share this code with the user to allow signup.</p>
            </div>
          </div>
        </DsCard>
      )}

      {/* Search */}
      <DsInput
        placeholder="Search by name, email, or role..."
        value={search}
        onChange={setSearch}
        className="max-w-md"
      />

      {/* Users Table */}
      <div>
        <SectionLabel accent={DS.orange}>
          All Users <DsCountPill count={filteredUsers.length} />
        </SectionLabel>

        {filteredUsers.length === 0 ? (
          <DsEmpty
            icon={<Users className="w-6 h-6" />}
            title="No Users Found"
            body="No users match your search criteria."
          />
        ) : (
          <DsTable>
            <DsThead>
              <DsTh>Name</DsTh>
              <DsTh>Email</DsTh>
              <DsTh>Role</DsTh>
              <DsTh>Platform Role</DsTh>
              <DsTh>1-on-1 Membership</DsTh>
              <DsTh>Membership Expiry</DsTh>
              <DsTh>Buyers Group</DsTh>
              <DsTh>1-on-1 Student</DsTh>
              <DsTh>Company</DsTh>
            </DsThead>
            <tbody>
              {filteredUsers.map((u) => (
                <DsTr key={u.user_id}>
                  {/* Name */}
                  <DsTd className="font-medium text-white">
                    {u.firstname || u.lastname
                      ? `${u.firstname || ''} ${u.lastname || ''}`.trim()
                      : 'N/A'}
                  </DsTd>

                  {/* Email */}
                  <DsTd className="text-neutral-400 text-xs">{u.email}</DsTd>

                  {/* System Role — admin-editable dropdown matching the
                      Platform Role dropdown styling next to it. Selecting a
                      different value opens the confirmation modal; we don't
                      mutate on bare onChange to avoid misclick demotions. */}
                  <DsTd>
                    <Select
                      value={u.role}
                      onValueChange={(val) => requestRoleChange(u, val as SystemRole)}
                      disabled={updatingUserId === u.user_id}
                    >
                      <SelectTrigger className="w-[110px] h-8 text-xs border-white/[0.08] bg-white/[0.03]">
                        <SelectValue>
                          <span
                            className="flex items-center gap-1.5 uppercase tracking-wider"
                            style={{ color: ROLE_COLOR[u.role.toLowerCase()] ?? DS.muted }}
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ backgroundColor: ROLE_COLOR[u.role.toLowerCase()] ?? DS.muted }}
                            />
                            {u.role}
                          </span>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className="border-white/[0.08] bg-[#0a0a0a]/95 backdrop-blur-xl">
                        {SYSTEM_ROLES.map((r) => (
                          <SelectItem key={r} value={r} className="rounded-lg hover:bg-white/[0.04]">
                            <span className="flex items-center gap-1.5 uppercase tracking-wider">
                              <span
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ backgroundColor: ROLE_COLOR[r] ?? DS.muted }}
                              />
                              {r}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </DsTd>

                  {/* Platform Role dropdown */}
                  <DsTd>
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
                  </DsTd>

                  {/* 1-on-1 Membership Toggle + Duration */}
                  <DsTd>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <Switch
                          id={`membership-${u.user_id}`}
                          checked={u.has_1on1_membership}
                          onCheckedChange={() => handleMembershipToggle(u.user_id, u.has_1on1_membership)}
                          disabled={updatingUserId === u.user_id}
                          className="data-[state=checked]:bg-[#FF6B35]"
                        />
                        {updatingUserId === u.user_id && (
                          <Loader2 className="w-3.5 h-3.5 text-[#FF6B35] animate-spin" />
                        )}
                      </div>
                      {/* Start date + duration picker -- shown when toggling ON */}
                      {pendingMembershipUserId === u.user_id && (
                        <div className="flex flex-col gap-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                          <div className="flex items-center gap-1.5">
                            <label className="text-[10px] text-neutral-500 whitespace-nowrap">Start:</label>
                            <Input
                              type="date"
                              value={pendingStartDate}
                              onChange={(e) => setPendingStartDate(e.target.value)}
                              className="h-7 w-[130px] text-[11px] border-[#FF6B35]/20 bg-[#FF6B35]/5 text-[#FF6B35] [color-scheme:dark]"
                            />
                          </div>
                          <div className="flex items-center gap-1.5">
                            <label className="text-[10px] text-neutral-500 whitespace-nowrap">Duration:</label>
                            <Select
                              value={pendingDuration}
                              onValueChange={handleDurationSelect}
                            >
                              <SelectTrigger className="w-[120px] h-7 text-[11px] border-[#FF6B35]/20 bg-[#FF6B35]/5 text-[#FF6B35]">
                                <SelectValue placeholder="Duration..." />
                              </SelectTrigger>
                              <SelectContent className="border-white/[0.08] bg-[#0a0a0a]/95 backdrop-blur-xl">
                                <SelectItem value="3" className="rounded-lg hover:bg-white/[0.04]">3 Months</SelectItem>
                                <SelectItem value="6" className="rounded-lg hover:bg-white/[0.04]">6 Months</SelectItem>
                                <SelectItem value="12" className="rounded-lg hover:bg-white/[0.04]">1 Year</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {pendingDuration && pendingStartDate && (
                            <p className="text-[10px] text-neutral-500">
                              End date:{' '}
                              <span className="text-[#FF6B35]/80">
                                {new Date(
                                  calculateEndDate(parseInt(pendingDuration, 10), pendingStartDate)
                                ).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </span>
                            </p>
                          )}
                          <div className="flex items-center gap-1.5">
                            <DsButton
                              variant="secondary"
                              onClick={confirmActivation}
                              disabled={!pendingDuration || !pendingStartDate}
                              className="h-6 px-3 text-[11px]"
                            >
                              <Check className="w-3 h-3" /> Activate
                            </DsButton>
                            <button
                              onClick={cancelPendingMembership}
                              className="text-neutral-500 hover:text-neutral-300 text-xs transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </DsTd>

                  {/* Membership Expiry */}
                  <DsTd>
                    {(() => {
                      const expiry = formatMembershipExpiry(u.membership_end_date, u.has_1on1_membership);
                      if (!u.has_1on1_membership) {
                        return <span className="text-neutral-600 text-xs">--</span>;
                      }

                      if (editingMembershipUserId === u.user_id) {
                        return (
                          <div className="flex flex-col gap-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                            <div className="flex items-center gap-1.5">
                              <label className="text-[10px] text-neutral-500 whitespace-nowrap">Start:</label>
                              <Input
                                type="date"
                                value={editingStartDate}
                                onChange={(e) => setEditingStartDate(e.target.value)}
                                className="h-7 w-[130px] text-[11px] border-[#FF6B35]/20 bg-[#FF6B35]/5 text-[#FF6B35] [color-scheme:dark]"
                              />
                            </div>
                            <div className="flex items-center gap-1.5">
                              <label className="text-[10px] text-neutral-500 whitespace-nowrap">Duration:</label>
                              <Select
                                value={editingDuration}
                                onValueChange={(val) => setEditingDuration(val)}
                              >
                                <SelectTrigger className="w-[120px] h-7 text-[11px] border-[#FF6B35]/20 bg-[#FF6B35]/5 text-[#FF6B35]">
                                  <SelectValue placeholder="Duration..." />
                                </SelectTrigger>
                                <SelectContent className="border-white/[0.08] bg-[#0a0a0a]/95 backdrop-blur-xl">
                                  <SelectItem value="3" className="rounded-lg hover:bg-white/[0.04]">3 Months</SelectItem>
                                  <SelectItem value="6" className="rounded-lg hover:bg-white/[0.04]">6 Months</SelectItem>
                                  <SelectItem value="12" className="rounded-lg hover:bg-white/[0.04]">1 Year</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            {editingDuration && editingStartDate && (
                              <p className="text-[10px] text-neutral-500">
                                New end date:{' '}
                                <span className="text-[#FF6B35]/80">
                                  {new Date(
                                    calculateEndDate(parseInt(editingDuration, 10), editingStartDate)
                                  ).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </span>
                              </p>
                            )}
                            <div className="flex items-center gap-1.5">
                              <DsButton
                                variant="secondary"
                                onClick={confirmEditMembership}
                                disabled={!editingDuration || !editingStartDate}
                                className="h-6 px-3 text-[11px]"
                              >
                                <Check className="w-3 h-3" /> Save
                              </DsButton>
                              <button
                                onClick={cancelEditingMembership}
                                className="text-neutral-500 hover:text-neutral-300 text-xs transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        );
                      }

                      if (!expiry) {
                        return (
                          <div className="flex items-center gap-1.5">
                            <span className="text-neutral-500 text-xs">No date set</span>
                            <button
                              onClick={() => startEditingMembership(u.user_id)}
                              className="text-[#FF6B35]/60 hover:text-[#FF6B35] transition-colors"
                              title="Set membership dates"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          </div>
                        );
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
                          <button
                            onClick={() => startEditingMembership(u.user_id)}
                            className="text-[#FF6B35]/60 hover:text-[#FF6B35] transition-colors"
                            title="Edit membership dates"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })()}
                  </DsTd>

                  {/* Buyers Group Access Toggle */}
                  <DsTd>
                    <div className="flex items-center gap-2">
                      <Switch
                        id={`buyersgroup-${u.user_id}`}
                        checked={u.buyersgroup}
                        onCheckedChange={() => handleBuyersGroupToggle(u.user_id, u.buyersgroup)}
                        disabled={updatingUserId === u.user_id}
                        className="data-[state=checked]:bg-[#FF6B35]"
                      />
                      {updatingUserId === u.user_id && (
                        <Loader2 className="w-3.5 h-3.5 text-[#FF6B35] animate-spin" />
                      )}
                    </div>
                  </DsTd>

                  {/* One-on-One Student Toggle */}
                  <DsTd>
                    <div className="flex items-center gap-2">
                      <Switch
                        id={`student-${u.user_id}`}
                        checked={u.is_one_on_one_student}
                        onCheckedChange={() => handleStudentFlagToggle(u.user_id, u.is_one_on_one_student)}
                        disabled={updatingUserId === u.user_id}
                        className="data-[state=checked]:bg-[#4ECDC4]"
                      />
                      {updatingUserId === u.user_id && (
                        <Loader2 className="w-3.5 h-3.5 text-[#4ECDC4] animate-spin" />
                      )}
                    </div>
                  </DsTd>

                  {/* Company */}
                  <DsTd className="text-neutral-400 text-xs">
                    {u.company_id ? (
                      <CompanyProfileDrawer companyId={u.company_id} isAdmin={true}>
                        {u.company?.name || `Company #${u.company_id}`}
                      </CompanyProfileDrawer>
                    ) : (
                      u.company?.name || 'N/A'
                    )}
                  </DsTd>
                </DsTr>
              ))}
            </tbody>
          </DsTable>
        )}
      </div>

      {/* 1-on-1 Chat Rooms Section */}
      <div>
        <SectionLabel accent={DS.teal}>
          <Users className="w-3.5 h-3.5" /> 1-on-1 Chat Rooms <DsCountPill count={oneOnOneRooms.length} accent={DS.teal} />
        </SectionLabel>

        <DsCard className="p-5">
          {loadingRooms ? (
            <div className="flex items-center justify-center py-8">
              <LoadingSpinner size="sm" />
            </div>
          ) : oneOnOneRooms.length === 0 ? (
            <DsEmpty
              icon={<Users className="w-6 h-6" />}
              title="No Rooms"
              body="No 1-on-1 rooms have been created yet."
            />
          ) : (
            <div className="grid gap-3">
              {oneOnOneRooms.map((room) => (
                <div
                  key={room.id}
                  className="flex items-center gap-4 px-4 py-3 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.03] transition-colors"
                >
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${DS.teal}1a` }}
                  >
                    <Users className="w-4 h-4" style={{ color: DS.teal }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-neutral-200 truncate">{room.name}</p>
                    <p className="text-[11px] text-neutral-500">
                      Student: {room.student_name ?? 'N/A'} &middot; Created{' '}
                      {new Date(room.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <DsButton
                    variant="ghost"
                    onClick={() => setManagingRoom(room)}
                    className="text-xs"
                  >
                    <Settings2 className="w-3.5 h-3.5" /> Manage
                  </DsButton>
                </div>
              ))}
            </div>
          )}
        </DsCard>
      </div>

      {/* Modal for managing chat participants */}
      {managingRoom && (
        <ManageChatMentorsModal
          open={!!managingRoom}
          onOpenChange={(open) => {
            if (!open) {
              setManagingRoom(null);
              fetchOneOnOneRooms();
            }
          }}
          chatRoomId={managingRoom.id}
          chatRoomName={managingRoom.name}
        />
      )}

      {/* System-role change confirmation modal. Mirrors the existing buyers-
          group/mentor-room modals — black backdrop, narrow card, copy varies
          by transition (see modalCopy). VA conversion adds a team-owner
          picker; everything else is a single confirm button. */}
      {roleModal && (() => {
        const fullName = `${roleModal.user.firstname ?? ''} ${roleModal.user.lastname ?? ''}`.trim() || roleModal.user.email;
        const copy = modalCopy({
          fromRole: (roleModal.user.role as SystemRole),
          toRole: roleModal.toRole,
          fullName,
        });
        const needsTeam = roleModal.toRole === 'va';
        return (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div
              className="w-full max-w-lg rounded-2xl border p-6 space-y-4"
              style={{ backgroundColor: DS.bg, borderColor: `${DS.orange}55` }}
            >
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-neutral-500 mb-1">
                  Role change · {roleModal.user.role} → {roleModal.toRole}
                </p>
                <h2 className="text-lg font-black text-white">{copy.title}</h2>
                <p className="text-sm text-neutral-300 font-sans mt-2 leading-relaxed">{copy.body}</p>
              </div>
              {needsTeam && (
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">
                    Assign to team
                  </label>
                  <select
                    value={roleModal.teamId}
                    onChange={(e) => setRoleModal((m) => (m ? { ...m, teamId: e.target.value } : m))}
                    className="w-full text-sm text-white rounded-lg px-3 py-2 border font-mono"
                    style={{ backgroundColor: DS.inputBg, borderColor: 'rgba(255,255,255,0.1)' }}
                    disabled={vaTeamOptionsLoading}
                  >
                    <option value="">
                      {vaTeamOptionsLoading
                        ? 'Loading teams…'
                        : (vaTeamOptions?.length ?? 0) === 0
                          ? 'No one-on-one student teams exist yet'
                          : 'Pick a team owner…'}
                    </option>
                    {(vaTeamOptions ?? []).map((opt) => (
                      <option key={opt.team_id} value={opt.team_id}>
                        {opt.owner_name} — {opt.team_name}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-neutral-500 mt-1 uppercase tracking-widest">
                    The selected student becomes the VA&apos;s team owner.
                  </p>
                </div>
              )}
              {roleModalError && (
                <p className="text-xs text-rose-400 font-sans">{roleModalError}</p>
              )}
              <div className="flex items-center justify-end gap-2 pt-2">
                <DsButton variant="ghost" onClick={() => setRoleModal(null)} disabled={roleModalSubmitting}>
                  Cancel
                </DsButton>
                <DsButton
                  accent={DS.orange}
                  onClick={submitRoleChange}
                  disabled={roleModalSubmitting || (needsTeam && !roleModal.teamId)}
                >
                  {roleModalSubmitting ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Updating…</>
                  ) : (
                    <><Check className="w-3.5 h-3.5" /> Confirm</>
                  )}
                </DsButton>
              </div>
            </div>
          </div>
        );
      })()}
    </PageShell>
  );
}
