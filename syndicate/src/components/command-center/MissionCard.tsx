'use client';

import { useState } from 'react';
import { GlassCard } from '@/components/ui/glass-card';
import { SubmitProofDialog } from './SubmitProofDialog';
import {
  Target,
  CheckCircle2,
  Clock,
  Send,
  XCircle,
  FileCheck,
  ChevronDown,
  ChevronUp,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@lib/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TaskProgress {
  id: number;
  status: 'pending' | 'submitted' | 'approved' | 'rejected';
  proof_submission: string | null;
}

export interface Task {
  id: number;
  title: string;
  description: string | null;
  order_index: number;
  requires_proof: boolean;
  progress?: TaskProgress | null;
}

export interface Mission {
  id: number;
  title: string;
  description: string | null;
  xp_reward: number;
  target_audience: string;
  tasks: Task[];
}

// ─── Status helpers ───────────────────────────────────────────────────────────

const statusConfig: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  approved: {
    label: 'Approved',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  },
  submitted: {
    label: 'In Review',
    icon: <Clock className="w-3.5 h-3.5" />,
    className: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  },
  rejected: {
    label: 'Rejected',
    icon: <XCircle className="w-3.5 h-3.5" />,
    className: 'bg-red-500/10 text-red-400 border-red-500/20',
  },
  pending: {
    label: 'Pending',
    icon: <FileCheck className="w-3.5 h-3.5" />,
    className: 'bg-neutral-500/10 text-neutral-400 border-neutral-500/20',
  },
};

function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] ?? statusConfig.pending;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold border leading-none',
        config.className,
      )}
    >
      {config.icon}
      {config.label}
    </span>
  );
}

// ─── Mission Card ─────────────────────────────────────────────────────────────

interface MissionCardProps {
  mission: Mission;
  userId: string;
  onProgressUpdate: () => void;
}

export function MissionCard({ mission, userId, onProgressUpdate }: MissionCardProps) {
  const [expanded, setExpanded] = useState(true);
  const [proofDialogOpen, setProofDialogOpen] = useState(false);
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const completedCount = mission.tasks.filter(
    (t) => t.progress?.status === 'approved',
  ).length;
  const totalTasks = mission.tasks.length;
  const isFullyCompleted = totalTasks > 0 && completedCount === totalTasks;
  const progressPct = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;

  const handleOpenProofDialog = (task: Task) => {
    setActiveTask(task);
    setProofDialogOpen(true);
  };

  const handleSubmitProof = async (proof: string) => {
    if (!activeTask) return;

    const existing = activeTask.progress;

    if (existing) {
      // Update existing progress
      await supabase
        .from('user_task_progress')
        .update({
          status: 'submitted',
          proof_submission: proof,
          submitted_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    } else {
      // Insert new progress
      await supabase.from('user_task_progress').insert({
        user_id: userId,
        task_id: activeTask.id,
        status: 'submitted',
        proof_submission: proof,
        submitted_at: new Date().toISOString(),
      });
    }

    onProgressUpdate();
  };

  const handleMarkComplete = async (task: Task) => {
    // For tasks that don't require proof — auto-submit as 'submitted'
    const existing = task.progress;

    if (existing) {
      await supabase
        .from('user_task_progress')
        .update({ status: 'submitted', submitted_at: new Date().toISOString() })
        .eq('id', existing.id);
    } else {
      await supabase.from('user_task_progress').insert({
        user_id: userId,
        task_id: task.id,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
      });
    }

    onProgressUpdate();
  };

  return (
    <>
      <GlassCard className={cn('transition-all duration-300', isFullyCompleted && 'border-emerald-500/20')}>
        {/* Card header */}
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
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-semibold text-white truncate">
                {mission.title}
              </h3>
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/15 whitespace-nowrap">
                <Zap className="w-2.5 h-2.5" />
                {mission.xp_reward} XP
              </span>
            </div>
            {mission.description && (
              <p className="text-xs text-neutral-500 line-clamp-2">{mission.description}</p>
            )}

            {/* Progress bar */}
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

        {/* Task list */}
        {expanded && (
          <div className="border-t border-white/[0.05] divide-y divide-white/[0.03]">
            {mission.tasks
              .sort((a, b) => a.order_index - b.order_index)
              .map((task) => {
                const status = task.progress?.status ?? 'pending';
                const isCompleted = status === 'approved';
                const isSubmitted = status === 'submitted';
                const isRejected = status === 'rejected';
                const canSubmit = !isCompleted && !isSubmitted;

                return (
                  <div
                    key={task.id}
                    className={cn(
                      'flex items-center gap-3 px-5 py-3 transition-colors',
                      isCompleted && 'bg-emerald-500/[0.02]',
                    )}
                  >
                    {/* Step indicator */}
                    <div
                      className={cn(
                        'w-6 h-6 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-bold border',
                        isCompleted
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
                          : 'bg-white/[0.03] text-neutral-500 border-white/[0.08]',
                      )}
                    >
                      {isCompleted ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        task.order_index + 1
                      )}
                    </div>

                    {/* Task info */}
                    <div className="flex-1 min-w-0">
                      <p
                        className={cn(
                          'text-sm font-medium truncate',
                          isCompleted ? 'text-neutral-500 line-through' : 'text-neutral-200',
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

                    {/* Status / Action */}
                    <div className="shrink-0 flex items-center gap-2">
                      {(isSubmitted || isCompleted || isRejected) && (
                        <StatusBadge status={status} />
                      )}

                      {canSubmit && task.requires_proof && (
                        <button
                          type="button"
                          onClick={() => handleOpenProofDialog(task)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 hover:border-amber-500/30 transition-all cursor-pointer"
                        >
                          <Send className="w-3 h-3" />
                          Submit Proof
                        </button>
                      )}

                      {canSubmit && !task.requires_proof && (
                        <button
                          type="button"
                          onClick={() => handleMarkComplete(task)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white/[0.04] text-neutral-400 border border-white/[0.08] hover:bg-amber-500/10 hover:text-amber-400 hover:border-amber-500/20 transition-all cursor-pointer"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          Mark Done
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </GlassCard>

      {/* Proof submission dialog */}
      {activeTask && (
        <SubmitProofDialog
          open={proofDialogOpen}
          onOpenChange={setProofDialogOpen}
          taskTitle={activeTask.title}
          onSubmit={handleSubmitProof}
        />
      )}
    </>
  );
}
