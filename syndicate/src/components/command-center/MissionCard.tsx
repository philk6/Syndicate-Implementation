'use client';

import { useState } from 'react';
import { GlassCard } from '@/components/ui/glass-card';
import {
  Target,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Zap,
  Award,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  completeTask,
  uncompleteTask,
  type Mission as MCMission,
  type Task as MCTask,
} from '@/lib/missionControl';

// Re-exported so the page's existing imports keep working.
export type Task = MCTask;
export type Mission = MCMission;

interface MissionCardProps {
  mission: Mission;
  userId: string;
  onProgressUpdate: () => void;
  onXpAwarded?: (amount: number) => void;
  onBadgeEarned?: (badgeName: string) => void;
}

export function MissionCard({
  mission,
  onProgressUpdate,
  onXpAwarded,
  onBadgeEarned,
}: MissionCardProps) {
  const [expanded, setExpanded] = useState(true);
  const [pendingTaskIds, setPendingTaskIds] = useState<Set<number>>(new Set());
  const [optimisticStatus, setOptimisticStatus] = useState<Record<number, 'approved' | null>>({});
  const [xpFlash, setXpFlash] = useState<{ taskId: number; amount: number } | null>(null);

  const effectiveStatus = (task: Task): 'approved' | 'pending' => {
    if (task.id in optimisticStatus) {
      return optimisticStatus[task.id] === 'approved' ? 'approved' : 'pending';
    }
    return task.progress?.status === 'approved' ? 'approved' : 'pending';
  };

  const completedCount = mission.tasks.filter((t) => effectiveStatus(t) === 'approved').length;
  const totalTasks = mission.tasks.length;
  const isFullyCompleted = totalTasks > 0 && completedCount === totalTasks;
  const progressPct = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;

  const handleToggle = async (task: Task) => {
    if (pendingTaskIds.has(task.id)) return;

    const wasApproved = effectiveStatus(task) === 'approved';
    const nextStatus: 'approved' | null = wasApproved ? null : 'approved';

    // Optimistic update
    setOptimisticStatus((s) => ({ ...s, [task.id]: nextStatus }));
    setPendingTaskIds((s) => new Set(s).add(task.id));

    try {
      if (nextStatus === 'approved') {
        const result = await completeTask(task.id);
        if (result.awarded_xp > 0) {
          setXpFlash({ taskId: task.id, amount: result.awarded_xp });
          onXpAwarded?.(result.awarded_xp);
          window.setTimeout(() => setXpFlash(null), 1800);
        }
        if (result.badge_earned) {
          onBadgeEarned?.(result.badge_earned);
        }
      } else {
        await uncompleteTask(task.id);
      }
      onProgressUpdate();
    } catch (err) {
      // Revert on error
      setOptimisticStatus((s) => {
        const next = { ...s };
        delete next[task.id];
        return next;
      });
      console.error('Failed to toggle task:', err);
    } finally {
      setPendingTaskIds((s) => {
        const next = new Set(s);
        next.delete(task.id);
        return next;
      });
    }
  };

  return (
    <GlassCard className={cn('transition-all duration-300', isFullyCompleted && 'border-emerald-500/20')}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-start gap-4 p-5 text-left cursor-pointer group"
      >
        <div
          className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors',
            isFullyCompleted
              ? 'bg-emerald-500/15 text-emerald-400'
              : 'bg-amber-500/10 text-amber-400',
          )}
        >
          {isFullyCompleted ? (
            <CheckCircle2 className="w-5 h-5" />
          ) : (
            <Target className="w-5 h-5" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="text-sm font-semibold text-white truncate">
              {mission.title}
            </h3>
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/15 whitespace-nowrap">
              <Zap className="w-2.5 h-2.5" />
              {mission.tasks.reduce((s, t) => s + t.xp_reward, 0)} XP
            </span>
            {mission.mission_type !== 'core' && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider bg-white/[0.04] text-neutral-400 border border-white/[0.08]">
                {mission.mission_type}
              </span>
            )}
            {isFullyCompleted && mission.badge_name && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Award className="w-2.5 h-2.5" />
                {mission.badge_name}
              </span>
            )}
          </div>
          {mission.description && (
            <p className="text-xs text-neutral-500 line-clamp-2">{mission.description}</p>
          )}

          <div className="flex items-center gap-2 mt-2.5">
            <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  isFullyCompleted
                    ? 'bg-emerald-500'
                    : 'bg-gradient-to-r from-amber-500 to-amber-400',
                )}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-[10px] text-neutral-500 font-medium tabular-nums whitespace-nowrap">
              {completedCount}/{totalTasks}
            </span>
          </div>
        </div>

        <div className="text-neutral-600 group-hover:text-neutral-400 transition-colors mt-1">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-white/[0.05] divide-y divide-white/[0.03]">
          {mission.tasks
            .slice()
            .sort((a, b) => a.order_index - b.order_index)
            .map((task) => {
              const isApproved = effectiveStatus(task) === 'approved';
              const isPending = pendingTaskIds.has(task.id);
              const showFlash = xpFlash?.taskId === task.id;

              return (
                <div
                  key={task.id}
                  className={cn(
                    'flex items-center gap-3 px-5 py-3 transition-colors relative',
                    isApproved && 'bg-emerald-500/[0.02]',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => handleToggle(task)}
                    disabled={isPending}
                    className={cn(
                      'w-6 h-6 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-bold border transition-all cursor-pointer',
                      isApproved
                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                        : 'bg-white/[0.03] text-neutral-500 border-white/[0.08] hover:bg-amber-500/10 hover:text-amber-400 hover:border-amber-500/20',
                      isPending && 'opacity-60 cursor-wait',
                    )}
                    aria-label={isApproved ? 'Uncheck task' : 'Complete task'}
                  >
                    {isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : isApproved ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      task.order_index + 1
                    )}
                  </button>

                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        'text-sm font-medium truncate',
                        isApproved ? 'text-neutral-500 line-through' : 'text-neutral-200',
                      )}
                    >
                      {task.title}
                    </p>
                    {task.description && (
                      <p className="text-[11px] text-neutral-600 truncate mt-0.5">
                        {task.description}
                      </p>
                    )}
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    <span
                      className={cn(
                        'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold border whitespace-nowrap',
                        isApproved
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-400 border-amber-500/15',
                      )}
                    >
                      <Zap className="w-2.5 h-2.5" />
                      {task.xp_reward}
                    </span>
                  </div>

                  {showFlash && (
                    <span
                      key={`flash-${task.id}-${xpFlash?.amount}`}
                      className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-emerald-400 font-bold text-sm animate-[xpFlash_1.8s_ease-out_forwards]"
                    >
                      +{xpFlash!.amount} XP
                    </span>
                  )}
                </div>
              );
            })}
        </div>
      )}

      <style jsx global>{`
        @keyframes xpFlash {
          0%   { opacity: 0; transform: translate(0, 0); }
          15%  { opacity: 1; transform: translate(0, -4px); }
          75%  { opacity: 1; transform: translate(0, -18px); }
          100% { opacity: 0; transform: translate(0, -28px); }
        }
      `}</style>
    </GlassCard>
  );
}
