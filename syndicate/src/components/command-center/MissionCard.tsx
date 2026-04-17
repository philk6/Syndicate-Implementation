'use client';

import { useState } from 'react';
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
  type MissionMedia,
} from '@/lib/missionControl';
import { MissionMediaSection } from './MissionMediaSection';

export type Task = MCTask;
export type Mission = MCMission;

interface MissionCardProps {
  mission: Mission;
  userId: string;
  phaseColor: string;
  hasBadge?: boolean;
  disabled?: boolean;
  isAdmin?: boolean;
  media?: MissionMedia[];
  onProgressUpdate: () => void;
  onXpAwarded?: (amount: number) => void;
  onBadgeEarned?: (badgeName: string) => void;
}

export function MissionCard({
  mission,
  phaseColor,
  hasBadge,
  disabled,
  isAdmin = false,
  media = [],
  onProgressUpdate,
  onXpAwarded,
  onBadgeEarned,
}: MissionCardProps) {
  const [expanded, setExpanded] = useState(false);
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
  const totalXp = mission.tasks.reduce((s, t) => s + t.xp_reward, 0);

  const handleToggle = async (task: Task) => {
    if (disabled || pendingTaskIds.has(task.id)) return;
    const wasApproved = effectiveStatus(task) === 'approved';
    const nextStatus: 'approved' | null = wasApproved ? null : 'approved';

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
        if (result.badge_earned) onBadgeEarned?.(result.badge_earned);
      } else {
        await uncompleteTask(task.id);
      }
      onProgressUpdate();
    } catch (err) {
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
    <div
      className="relative rounded-2xl border  transition-all overflow-hidden"
      style={{
        borderColor: isFullyCompleted ? phaseColor : `${phaseColor}33`,
        backgroundColor: 'rgba(10,10,15,0.6)',
        boxShadow: isFullyCompleted
          ? `0 0 32px ${phaseColor}66, inset 0 0 16px ${phaseColor}22`
          : `0 0 0 rgba(0,0,0,0)`,
      }}
    >
      {/* Left phase color accent */}
      <div
        className="absolute top-0 left-0 bottom-0 w-1"
        style={{
          backgroundColor: phaseColor,
          boxShadow: `0 0 12px ${phaseColor}`,
        }}
      />

      {/* COMPLETE stamp */}
      {isFullyCompleted && (
        <div
          className="absolute top-3 right-3 px-2 py-0.5 rounded-md border font-mono text-[10px] font-black uppercase tracking-widest rotate-[-4deg] animate-pulse pointer-events-none"
          style={{
            color: phaseColor,
            borderColor: phaseColor,
            backgroundColor: `${phaseColor}1a`,
            textShadow: `0 0 8px ${phaseColor}`,
            boxShadow: `0 0 16px ${phaseColor}55`,
          }}
        >
          ✓ Complete
        </div>
      )}

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-start gap-4 p-5 pl-6 text-left cursor-pointer group"
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors border"
          style={{
            backgroundColor: `${phaseColor}1a`,
            borderColor: `${phaseColor}55`,
            color: phaseColor,
          }}
        >
          {isFullyCompleted ? (
            <CheckCircle2 className="w-5 h-5" />
          ) : (
            <Target className="w-5 h-5" />
          )}
        </div>

        <div className="flex-1 min-w-0 pr-20">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3
              className="text-sm font-bold font-mono uppercase tracking-wider truncate"
              style={{ color: '#ffffff', textShadow: `0 0 8px ${phaseColor}66` }}
            >
              {mission.title}
            </h3>
            <span
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold border font-mono whitespace-nowrap"
              style={{
                backgroundColor: `${phaseColor}1a`,
                color: phaseColor,
                borderColor: `${phaseColor}55`,
              }}
            >
              <Zap className="w-2.5 h-2.5" />
              {totalXp} XP
            </span>
            {mission.mission_type !== 'core' && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold font-mono uppercase tracking-wider bg-white/[0.04] text-neutral-400 border border-white/[0.08]">
                {mission.mission_type}
              </span>
            )}
            {(hasBadge || (isFullyCompleted && mission.badge_name)) && mission.badge_name && (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold font-mono border"
                style={{
                  backgroundColor: `${phaseColor}1a`,
                  color: phaseColor,
                  borderColor: `${phaseColor}66`,
                  boxShadow: `0 0 10px ${phaseColor}55`,
                }}
              >
                <Award className="w-2.5 h-2.5" />
                {mission.badge_name}
              </span>
            )}
          </div>
          {mission.description && (
            <p className="text-xs text-neutral-400 line-clamp-2">{mission.description}</p>
          )}

          <div className="flex items-center gap-2 mt-2.5">
            <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${progressPct}%`,
                  backgroundColor: phaseColor,
                  boxShadow: `0 0 8px ${phaseColor}`,
                }}
              />
            </div>
            <span className="text-[10px] text-neutral-400 font-mono tabular-nums whitespace-nowrap">
              {completedCount}/{totalTasks}
            </span>
          </div>
        </div>

        <div className="text-neutral-500 group-hover:text-neutral-300 transition-colors mt-1 shrink-0">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {expanded && (
        <>
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
                    'flex items-center gap-3 px-5 pl-6 py-3 transition-colors relative',
                  )}
                  style={{
                    backgroundColor: isApproved ? `${phaseColor}0d` : 'transparent',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => handleToggle(task)}
                    disabled={isPending || disabled}
                    className={cn(
                      'w-6 h-6 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-mono font-bold border transition-all cursor-pointer',
                      isPending && 'opacity-60 cursor-wait',
                      disabled && !isApproved && 'opacity-40 cursor-not-allowed',
                    )}
                    style={{
                      backgroundColor: isApproved ? `${phaseColor}2a` : 'rgba(255,255,255,0.03)',
                      color: isApproved ? phaseColor : 'rgba(255,255,255,0.45)',
                      borderColor: isApproved ? `${phaseColor}66` : 'rgba(255,255,255,0.1)',
                      boxShadow: isApproved ? `0 0 10px ${phaseColor}66` : 'none',
                    }}
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
                        'text-sm font-medium truncate font-mono',
                        isApproved ? 'text-neutral-500 line-through' : 'text-neutral-200',
                      )}
                    >
                      {task.title}
                    </p>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    <span
                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold border font-mono whitespace-nowrap"
                      style={{
                        backgroundColor: isApproved ? `${phaseColor}1f` : `${phaseColor}12`,
                        color: phaseColor,
                        borderColor: `${phaseColor}44`,
                      }}
                    >
                      <Zap className="w-2.5 h-2.5" />
                      {task.xp_reward}
                    </span>
                  </div>

                  {showFlash && (
                    <span
                      key={`flash-${task.id}-${xpFlash?.amount}`}
                      className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 font-bold text-sm font-mono animate-[mcXpFlash_1.8s_ease-out_forwards]"
                      style={{
                        color: phaseColor,
                        textShadow: `0 0 12px ${phaseColor}`,
                      }}
                    >
                      +{xpFlash!.amount} XP
                    </span>
                  )}
                </div>
              );
            })}
        </div>
        <MissionMediaSection
          missionId={mission.id}
          media={media}
          phaseColor={phaseColor}
          isAdmin={isAdmin}
          onChange={onProgressUpdate}
        />
        </>
      )}

      <style jsx global>{`
        @keyframes mcXpFlash {
          0%   { opacity: 0; transform: translate(0, 0); }
          15%  { opacity: 1; transform: translate(0, -6px); }
          75%  { opacity: 1; transform: translate(0, -22px); }
          100% { opacity: 0; transform: translate(0, -34px); }
        }
      `}</style>
    </div>
  );
}
