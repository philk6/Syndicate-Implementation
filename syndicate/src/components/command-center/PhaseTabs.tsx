'use client';

import { cn } from '@/lib/utils';
import { Lock, CheckCircle2, Infinity as InfinityIcon } from 'lucide-react';
import type { Phase } from '@/lib/missionControl';

export interface PhaseMeta {
  phase: Phase;
  isUnlocked: boolean;
  isComplete: boolean;
  missionCount: number;
  completedCount: number;
}

interface PhaseTabsProps {
  phases: PhaseMeta[];
  activePhaseId: number;
  onChange: (phaseId: number) => void;
}

export function PhaseTabs({ phases, activePhaseId, onChange }: PhaseTabsProps) {
  return (
    <div className="w-full overflow-x-auto pb-2 -mx-2 px-2 [scrollbar-width:thin]">
      <div className="flex items-stretch gap-3 min-w-max">
        {phases.map(({ phase, isUnlocked, isComplete, missionCount, completedCount }) => {
          const isActive = phase.id === activePhaseId;
          const color = phase.color;

          return (
            <button
              key={phase.id}
              type="button"
              onClick={() => onChange(phase.id)}
              className={cn(
                'relative flex flex-col items-start gap-1 px-4 py-3 rounded-xl border backdrop-blur-sm transition-all text-left min-w-[180px] cursor-pointer',
                !isUnlocked && !isActive && 'opacity-75',
              )}
              style={{
                borderColor: isActive ? color : `${color}40`,
                backgroundColor: isActive ? `${color}1a` : `${color}08`,
                boxShadow: isActive ? `0 0 30px ${color}55, inset 0 0 18px ${color}22` : 'none',
              }}
            >
              <div className="flex items-center gap-2 w-full">
                <span
                  className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor: color,
                    color: '#0a0a0f',
                  }}
                >
                  P{phase.id}
                </span>
                <span
                  className="text-[11px] font-bold uppercase tracking-wider flex-1"
                  style={{ color: isActive ? color : 'rgba(255,255,255,0.85)' }}
                >
                  {phase.name}
                </span>
                {!isUnlocked && <Lock className="w-3 h-3 text-neutral-500 shrink-0" />}
                {isUnlocked && isComplete && (
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" style={{ color }} />
                )}
              </div>

              <div className="flex items-center gap-2 w-full">
                <div className="flex-1 h-1 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${missionCount > 0 ? (completedCount / missionCount) * 100 : 0}%`,
                      backgroundColor: color,
                      boxShadow: `0 0 8px ${color}`,
                    }}
                  />
                </div>
                <span className="text-[9px] font-mono text-neutral-500 tabular-nums whitespace-nowrap">
                  {completedCount}/{missionCount}
                </span>
              </div>

              {phase.always_available && (
                <span
                  className="absolute -top-2 left-3 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest inline-flex items-center gap-0.5"
                  style={{
                    backgroundColor: color,
                    color: '#0a0a0f',
                  }}
                >
                  <InfinityIcon className="w-2.5 h-2.5" />
                  Always
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
