'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@lib/auth';
import { supabase } from '@lib/supabase/client';
import { PageLoadingSpinner } from '@/components/ui/loading-spinner';

import { XpHeader } from '@/components/command-center/XpHeader';
import { MissionCard, type Mission } from '@/components/command-center/MissionCard';
import { PlaceholderCard } from '@/components/command-center/PlaceholderCard';
import { Target } from 'lucide-react';
import { getMissionControlData } from '@/lib/missionControl';

export default function CommandCenterPage() {
  const { isAuthenticated, loading: authLoading, user } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [totalXp, setTotalXp] = useState(0);
  const [firstname, setFirstname] = useState<string | undefined>(undefined);
  const [missions, setMissions] = useState<Mission[]>([]);

  const fetchData = useCallback(async () => {
    if (!user?.user_id) return;
    setLoading(true);
    try {
      const [{ data: profile }, mc] = await Promise.all([
        supabase
          .from('users')
          .select('firstname')
          .eq('user_id', user.user_id)
          .single(),
        getMissionControlData(user.user_id),
      ]);

      setFirstname(
        profile?.firstname
          ? profile.firstname.charAt(0).toUpperCase() + profile.firstname.slice(1).toLowerCase()
          : undefined,
      );
      setTotalXp(mc.totalXp);
      setMissions(mc.missions);
    } catch (err) {
      console.error('Error fetching command center data:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.user_id]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    if (!user?.user_id) return;
    fetchData();
  }, [isAuthenticated, authLoading, router, user?.user_id, fetchData]);

  if (authLoading || loading) return <PageLoadingSpinner />;
  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen p-6 w-full">
      <div className="max-w-7xl mx-auto">
        <XpHeader totalXp={totalXp} firstname={firstname} />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
