'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@lib/auth';
import { supabase } from '@lib/supabase/client';
import { PageLoadingSpinner } from '@/components/ui/loading-spinner';

import { XpHeader } from '@/components/command-center/XpHeader';
import { MissionCard, type Mission, type Task } from '@/components/command-center/MissionCard';
import { PlaceholderCard } from '@/components/command-center/PlaceholderCard';
import { Target } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserProfile {
  firstname: string | null;
  has_1on1_membership: boolean;
  buyersgroup: boolean;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CommandCenterPage() {
  const { isAuthenticated, loading: authLoading, user } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [totalXp, setTotalXp] = useState(0);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [missions, setMissions] = useState<Mission[]>([]);

  // ── Data fetching ─────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    if (!user?.user_id) return;

    setLoading(true);

    try {
      // 1. Fetch user profile
      const { data: profileData } = await supabase
        .from('users')
        .select('firstname, has_1on1_membership, buyersgroup')
        .eq('user_id', user.user_id)
        .single();

      const userProfile: UserProfile = {
        firstname: profileData?.firstname ?? null,
        has_1on1_membership: profileData?.has_1on1_membership ?? false,
        buyersgroup: profileData?.buyersgroup ?? false,
      };
      setProfile(userProfile);

      // 2. Fetch total XP
      const { data: xpRows } = await supabase
        .from('xp_transactions')
        .select('amount')
        .eq('user_id', user.user_id);

      const xpTotal = (xpRows ?? []).reduce((sum, r) => sum + r.amount, 0);
      setTotalXp(xpTotal);

      // 3. Build audience filter — user can see missions with audience 'all' + any matching booleans
      const allowedAudiences = ['all'];
      if (userProfile.has_1on1_membership) allowedAudiences.push('1on1');
      if (userProfile.buyersgroup) allowedAudiences.push('buyersgroup');

      // 4. Fetch active missions matching the audience
      const { data: missionData } = await supabase
        .from('missions')
        .select('id, title, description, xp_reward, target_audience')
        .eq('is_active', true)
        .in('target_audience', allowedAudiences)
        .order('created_at', { ascending: false });

      if (!missionData || missionData.length === 0) {
        setMissions([]);
        setLoading(false);
        return;
      }

      const missionIds = missionData.map((m) => m.id);

      // 5. Fetch tasks for those missions
      const { data: taskData } = await supabase
        .from('tasks')
        .select('id, mission_id, title, description, order_index, requires_proof')
        .in('mission_id', missionIds)
        .order('order_index', { ascending: true });

      // 6. Fetch user progress for those tasks
      const taskIds = (taskData ?? []).map((t) => t.id);
      let progressMap: Record<number, { id: number; status: string; proof_submission: string | null }> = {};

      if (taskIds.length > 0) {
        const { data: progressData } = await supabase
          .from('user_task_progress')
          .select('id, task_id, status, proof_submission')
          .eq('user_id', user.user_id)
          .in('task_id', taskIds);

        if (progressData) {
          for (const p of progressData) {
            progressMap[p.task_id] = {
              id: p.id,
              status: p.status,
              proof_submission: p.proof_submission,
            };
          }
        }
      }

      // 7. Assemble the mission objects
      const assembledMissions: Mission[] = missionData.map((m) => {
        const mTasks: Task[] = (taskData ?? [])
          .filter((t) => t.mission_id === m.id)
          .map((t) => ({
            id: t.id,
            title: t.title,
            description: t.description,
            order_index: t.order_index,
            requires_proof: t.requires_proof,
            progress: progressMap[t.id]
              ? {
                  id: progressMap[t.id].id,
                  status: progressMap[t.id].status as 'pending' | 'submitted' | 'approved' | 'rejected',
                  proof_submission: progressMap[t.id].proof_submission,
                }
              : null,
          }));

        return {
          id: m.id,
          title: m.title,
          description: m.description,
          xp_reward: m.xp_reward,
          target_audience: m.target_audience,
          tasks: mTasks,
        };
      });

      setMissions(assembledMissions);
    } catch (err) {
      console.error('Error fetching command center data:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.user_id]);

  // ── Effects ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    if (!user?.user_id) return;

    fetchData();
  }, [isAuthenticated, authLoading, router, user?.user_id, fetchData]);

  // ── Loading / auth guard ────────────────────────────────────────────────────

  if (authLoading || loading) {
    return <PageLoadingSpinner />;
  }

  if (!isAuthenticated) return null;

  // Format first name for display
  const firstName = profile?.firstname
    ? profile.firstname.charAt(0).toUpperCase() + profile.firstname.slice(1).toLowerCase()
    : undefined;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen p-6 w-full">
      <div className="max-w-7xl mx-auto">
        {/* ── XP Header ────────────────────────────────────────────────── */}
        <XpHeader totalXp={totalXp} firstname={firstName} />

        {/* ── Grid Layout ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* ── Main Column: Active Missions (span 2) ──────────────────── */}
          <div className="md:col-span-2 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Target className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
                Active Missions
              </h2>
              <span className="text-[10px] font-medium text-neutral-600 bg-white/[0.04] px-1.5 py-0.5 rounded-md">
                {missions.length}
              </span>
            </div>

            {missions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4">
                  <Target className="w-7 h-7 text-neutral-600" />
                </div>
                <h3 className="text-sm font-medium text-neutral-500 mb-1">
                  No Active Missions
                </h3>
                <p className="text-xs text-neutral-600 max-w-[260px]">
                  Check back later — new missions will appear here when available.
                </p>
              </div>
            ) : (
              missions.map((mission) => (
                <MissionCard
                  key={mission.id}
                  mission={mission}
                  userId={user!.user_id}
                  onProgressUpdate={fetchData}
                />
              ))
            )}
          </div>

          {/* ── Side Column: Operations Brief (span 1) ─────────────────── */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider mb-1">
              Operations Brief
            </h2>
            <PlaceholderCard title="Top Leaderboard" icon="trophy" />
            <PlaceholderCard title="Recent Orders" icon="orders" />
          </div>
        </div>
      </div>
    </div>
  );
}
