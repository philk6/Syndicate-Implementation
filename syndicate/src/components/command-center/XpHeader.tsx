'use client';

import { getRankProgress } from '@/lib/utils/xp';
import { Zap, TrendingUp } from 'lucide-react';

interface XpHeaderProps {
  totalXp: number;
  firstname?: string;
}

export function XpHeader({ totalXp, firstname }: XpHeaderProps) {
  const { rank, nextRank, xpToNextRank, progressPercent } = getRankProgress(totalXp);

  return (
    <div className="mb-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1 tracking-tight">
            Command Center
          </h1>
          <p className="text-neutral-400 text-sm">
            {firstname ? `Welcome back, ${firstname}. ` : ''}Complete missions to earn XP and rank up.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="relative">
            <div
              className="w-14 h-14 rounded-2xl border flex items-center justify-center"
              style={{
                backgroundColor: `${rank.color}1f`,
                borderColor: `${rank.color}40`,
                boxShadow: `0 0 24px ${rank.color}33`,
              }}
            >
              <span
                className="text-[10px] font-black tracking-tight uppercase text-center leading-tight"
                style={{ color: rank.color }}
              >
                {rank.name.split(' ').map((w, i) => (
                  <span key={i} className="block">{w}</span>
                ))}
              </span>
            </div>
            <div
              className="absolute -inset-0.5 rounded-2xl border animate-pulse pointer-events-none"
              style={{ borderColor: `${rank.color}1a` }}
            />
          </div>
          <div className="min-w-0">
            <p
              className="text-xs font-semibold uppercase tracking-wider mb-0.5"
              style={{ color: `${rank.color}cc` }}
            >
              {rank.name}
            </p>
            <div className="flex items-center gap-2">
              <div className="w-32 h-2 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${progressPercent}%`,
                    backgroundColor: rank.color,
                  }}
                />
              </div>
              <span className="text-[10px] text-neutral-500 font-medium tabular-nums whitespace-nowrap">
                {nextRank
                  ? `${xpToNextRank.toLocaleString()} XP to ${nextRank.name}`
                  : 'Max rank'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mt-5">
        <div
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border"
          style={{
            backgroundColor: `${rank.color}12`,
            borderColor: `${rank.color}33`,
            color: rank.color,
          }}
        >
          <Zap className="w-3.5 h-3.5" />
          {totalXp.toLocaleString()} Total XP
        </div>
        {nextRank && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-neutral-400 text-xs font-medium">
            <TrendingUp className="w-3.5 h-3.5" />
            {xpToNextRank.toLocaleString()} XP to {nextRank.name}
          </div>
        )}
      </div>
    </div>
  );
}
