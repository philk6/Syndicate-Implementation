'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@lib/auth';
import { supabase } from '@lib/supabase/client';
import { PageLoadingSpinner } from '@/components/ui/loading-spinner';
import { Zap, Radio, Lock } from 'lucide-react';

import { MissionControlBackground } from '@/components/command-center/MissionControlBackground';
import { HeaderAnimatedBg } from '@/components/command-center/HeaderAnimatedBg';
import { RankBar } from '@/components/command-center/RankBar';
import { PhaseTabs, type PhaseMeta } from '@/components/command-center/PhaseTabs';
import { MissionCard } from '@/components/command-center/MissionCard';
import {
  getMissionControlData,
  type MissionControlData,
} from '@/lib/missionControl';
import { getRankProgress } from '@/lib/utils/xp';

export default function CommandCenterPage() {
  const { isAuthenticated, loading: authLoading, user } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [firstname, setFirstname] = useState<string | undefined>(undefined);
  const [data, setData] = useState<MissionControlData | null>(null);
  const [activePhaseId, setActivePhaseId] = useState<number>(1);

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
      setData(mc);
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

  // Compute per-phase completion and unlock state
  const phaseMetas = useMemo<PhaseMeta[]>(() => {
    if (!data) return [];
    const metas: PhaseMeta[] = [];
    let prevPhaseComplete = true;
    for (const phase of data.phases) {
      const missionsForPhase = data.missions.filter((m) => m.phase_id === phase.id);
      const completedMissions = missionsForPhase.filter((m) =>
        m.tasks.length > 0 &&
        m.tasks.every((t) => t.progress?.status === 'approved'),
      );
      const isComplete =
        missionsForPhase.length > 0 && completedMissions.length === missionsForPhase.length;
      const isUnlocked = phase.always_available || phase.id === 1 || prevPhaseComplete;
      metas.push({
        phase,
        isUnlocked,
        isComplete,
        missionCount: missionsForPhase.length,
        completedCount: completedMissions.length,
      });
      if (!phase.always_available) {
        prevPhaseComplete = prevPhaseComplete && isComplete;
      }
    }
    return metas;
  }, [data]);

  // Missions filtered to active phase, sorted
  const activePhaseMissions = useMemo(() => {
    if (!data) return [];
    return data.missions
      .filter((m) => m.phase_id === activePhaseId)
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [data, activePhaseId]);

  const activePhase = data?.phases.find((p) => p.id === activePhaseId);
  const activePhaseColor = activePhase?.color ?? '#888888';
  const activePhaseMeta = phaseMetas.find((pm) => pm.phase.id === activePhaseId);
  const activePhaseIsLocked = activePhaseMeta ? !activePhaseMeta.isUnlocked : false;
  const prevPhaseName =
    activePhaseId > 1
      ? data?.phases.find((p) => p.id === activePhaseId - 1)?.name
      : null;

  const badgeByMission = useMemo(() => {
    const m = new Map<number, true>();
    for (const b of data?.badges ?? []) m.set(b.mission_id, true);
    return m;
  }, [data]);

  if (authLoading || loading || !data) {
    return (
      <>
        <MissionControlBackground />
        <PageLoadingSpinner />
      </>
    );
  }
  if (!isAuthenticated) return null;

  const { rank, nextRank, xpToNextRank, progressPercent } = getRankProgress(data.totalXp);
  const missionsCompleted = data.missions.filter(
    (m) => m.tasks.length > 0 && m.tasks.every((t) => t.progress?.status === 'approved'),
  ).length;
  const tasksCompleted = data.missions.reduce(
    (s, m) => s + m.tasks.filter((t) => t.progress?.status === 'approved').length,
    0,
  );

  return (
    <>
      <MissionControlBackground />

      <div className="relative min-h-screen w-full text-neutral-100 font-mono">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
          {/* ── Header ──────────────────────────────────────────────── */}
          <header className="relative rounded-2xl border border-white/[0.12] overflow-hidden p-6">
            <HeaderAnimatedBg />
            <div className="relative flex flex-col md:flex-row md:items-start md:justify-between gap-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="relative inline-flex items-center">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" style={{ boxShadow: '0 0 10px rgb(52 211 153)' }} />
                    <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-emerald-400">
                    Systems Online
                  </span>
                  <Radio className="w-3 h-3 text-emerald-400/70 ml-1" />
                </div>
                <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-neutral-500 mb-1">
                  The Amazon Syndicate
                </p>
                <h1
                  className="text-4xl sm:text-5xl font-black tracking-tight text-white leading-none"
                  style={{ textShadow: '0 0 18px rgba(255,255,255,0.2), 0 0 40px rgba(255,107,53,0.25)' }}
                >
                  MISSION CONTROL
                </h1>
                {firstname && (
                  <p className="text-sm text-neutral-400 mt-2">
                    Welcome back, <span className="text-neutral-200 font-bold">{firstname}</span>.
                  </p>
                )}
              </div>

              {/* Rank summary */}
              <div className="flex flex-col items-start md:items-end gap-3 shrink-0">
                <div className="flex items-center gap-3">
                  <div
                    className="w-16 h-16 rounded-2xl border flex items-center justify-center relative"
                    style={{
                      backgroundColor: `${rank.color}1f`,
                      borderColor: `${rank.color}66`,
                      boxShadow: `0 0 32px ${rank.color}66, inset 0 0 14px ${rank.color}33`,
                    }}
                  >
                    <span
                      className="text-[10px] font-black text-center leading-tight uppercase tracking-wider px-1"
                      style={{ color: rank.color }}
                    >
                      {rank.name.split(' ').map((w, i) => (
                        <span key={i} className="block">{w}</span>
                      ))}
                    </span>
                  </div>
                  <div>
                    <div className="flex items-baseline gap-1 mb-0.5">
                      <Zap className="w-3.5 h-3.5" style={{ color: rank.color }} />
                      <span
                        className="text-2xl font-black tabular-nums tracking-tight"
                        style={{ color: rank.color, textShadow: `0 0 10px ${rank.color}66` }}
                      >
                        {data.totalXp.toLocaleString()}
                      </span>
                      <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">XP</span>
                    </div>
                    <div className="w-48 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${progressPercent}%`,
                          backgroundColor: rank.color,
                          boxShadow: `0 0 8px ${rank.color}`,
                        }}
                      />
                    </div>
                    <span className="text-[10px] text-neutral-500 tabular-nums">
                      {nextRank
                        ? `${xpToNextRank.toLocaleString()} XP to ${nextRank.name}`
                        : 'Max rank achieved'}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <StatPill label="Missions" value={`${missionsCompleted}/${data.missions.length}`} />
                  <StatPill label="Tasks" value={`${tasksCompleted}`} />
                  <StatPill label="Badges" value={`${data.badges.length}`} />
                </div>
              </div>
            </div>
          </header>

          {/* ── Rank Bar ────────────────────────────────────────────── */}
          <section>
            <SectionTitle>Rank Progression</SectionTitle>
            <RankBar totalXp={data.totalXp} />
          </section>

          {/* ── Phase Tabs ──────────────────────────────────────────── */}
          <section>
            <SectionTitle>Operational Phases</SectionTitle>
            <PhaseTabs
              phases={phaseMetas}
              activePhaseId={activePhaseId}
              onChange={setActivePhaseId}
            />
          </section>

          {/* ── Mission list ────────────────────────────────────────── */}
          <section>
            <div className="flex items-center gap-3 mb-3">
              <span
                className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded"
                style={{ backgroundColor: activePhaseColor, color: '#0a0a0f' }}
              >
                P{activePhaseId}
              </span>
              <h2
                className="text-sm font-bold uppercase tracking-[0.25em]"
                style={{ color: activePhaseColor }}
              >
                {activePhase?.name ?? 'Phase'} · Missions
              </h2>
              <span className="text-[10px] text-neutral-500 font-mono">
                {activePhaseMissions.length}
              </span>
            </div>

            {activePhaseIsLocked && (
              <div
                className="mb-3 rounded-xl border backdrop-blur-md p-4 flex items-start gap-3"
                style={{
                  borderColor: `${activePhaseColor}55`,
                  backgroundColor: `${activePhaseColor}0d`,
                }}
              >
                <Lock className="w-4 h-4 mt-0.5 shrink-0" style={{ color: activePhaseColor }} />
                <div className="flex-1 text-xs">
                  <p
                    className="font-bold uppercase tracking-widest mb-0.5"
                    style={{ color: activePhaseColor }}
                  >
                    Phase Locked
                  </p>
                  <p className="text-neutral-400">
                    You can browse missions in this phase, but tasks cannot be completed until
                    you finish{' '}
                    <span className="text-neutral-200 font-semibold">
                      {prevPhaseName ?? 'the previous phase'}
                    </span>
                    .
                  </p>
                </div>
              </div>
            )}

            {activePhaseMissions.length === 0 ? (
              <div className="rounded-2xl border border-white/[0.06] bg-black/30 backdrop-blur-md p-10 text-center text-neutral-500 text-sm">
                No missions in this phase yet.
              </div>
            ) : (
              <div className="space-y-3">
                {activePhaseMissions.map((mission) => (
                  <MissionCard
                    key={mission.id}
                    mission={mission}
                    userId={user!.user_id}
                    phaseColor={activePhaseColor}
                    hasBadge={badgeByMission.has(mission.id)}
                    disabled={activePhaseIsLocked}
                    isAdmin={user?.role === 'admin'}
                    media={data.mediaByMission[mission.id] ?? []}
                    onProgressUpdate={fetchData}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

// ─── Small helpers ──────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[10px] font-bold uppercase tracking-[0.35em] text-neutral-500 mb-2 flex items-center gap-2">
      <span className="w-6 h-px bg-neutral-700" />
      {children}
      <span className="flex-1 h-px bg-neutral-800" />
    </h2>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="inline-flex items-baseline gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/[0.08] font-mono">
      <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
        {label}
      </span>
      <span className="text-xs font-bold text-neutral-100 tabular-nums">{value}</span>
    </div>
  );
}
