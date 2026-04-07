'use client';

import { getLevelProgress } from '@/lib/utils/xp';
import { Zap, TrendingUp } from 'lucide-react';

interface XpHeaderProps {
  totalXp: number;
  firstname?: string;
}

export function XpHeader({ totalXp, firstname }: XpHeaderProps) {
  const progress = getLevelProgress(totalXp);
  const pct =
    progress.xpRequiredForLevelUp > 0
      ? Math.min(100, Math.round((progress.xpIntoCurrentLevel / progress.xpRequiredForLevelUp) * 100))
      : 0;

  return (
    <div className="mb-8">
      {/* Title row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1 tracking-tight">
            Command Center
          </h1>
          <p className="text-neutral-400 text-sm">
            {firstname ? `Welcome back, ${firstname}. ` : ''}Complete missions to earn XP and level up.
          </p>
        </div>

        {/* Level badge */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="relative">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400/20 to-amber-600/10 border border-amber-500/25 flex items-center justify-center shadow-[0_0_24px_rgba(245,158,11,0.1)]">
              <span className="text-lg font-black text-amber-400 tracking-tight">
                {progress.level}
              </span>
            </div>
            {/* Pulsing ring */}
            <div className="absolute -inset-0.5 rounded-2xl border border-amber-500/10 animate-pulse pointer-events-none" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-amber-400/80 uppercase tracking-wider mb-0.5">
              Level {progress.level}
            </p>
            <div className="flex items-center gap-2">
              <div className="w-32 h-2 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-700 ease-out"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-[10px] text-neutral-500 font-medium tabular-nums whitespace-nowrap">
                {progress.xpIntoCurrentLevel}/{progress.xpRequiredForLevelUp} XP
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* XP stat pills */}
      <div className="flex flex-wrap gap-3 mt-5">
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/[0.07] border border-amber-500/15 text-amber-400 text-xs font-semibold">
          <Zap className="w-3.5 h-3.5" />
          {progress.totalXp.toLocaleString()} Total XP
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-neutral-400 text-xs font-medium">
          <TrendingUp className="w-3.5 h-3.5" />
          {progress.xpForNextLevel.toLocaleString()} XP to Level {progress.level + 1}
        </div>
      </div>
    </div>
  );
}
