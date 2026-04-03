'use client';

import { calculateLevelFromXP, getLevelProgress } from '@/lib/utils/xp';

interface LevelBadgeProps {
  /** Raw total XP — the component calculates the level internally. */
  totalXp: number;
  /** 'sm' = inline next-to-name, 'md' = sidebar / card size */
  size?: 'sm' | 'md';
  /** If true, show a tiny XP progress bar below the badge (md only). */
  showProgress?: boolean;
  className?: string;
}

/**
 * A small pill that displays a user's level, styled to match the
 * amber / dark glass theme used throughout The Syndicate.
 */
export function LevelBadge({
  totalXp,
  size = 'sm',
  showProgress = false,
  className = '',
}: LevelBadgeProps) {
  const level = calculateLevelFromXP(totalXp);
  const progress = getLevelProgress(totalXp);
  const pct =
    progress.xpRequiredForLevelUp > 0
      ? Math.min(
          100,
          Math.round(
            (progress.xpIntoCurrentLevel / progress.xpRequiredForLevelUp) * 100,
          ),
        )
      : 0;

  if (size === 'sm') {
    return (
      <span
        className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold leading-none tracking-wide bg-amber-500/15 text-amber-400 border border-amber-500/20 select-none ${className}`}
        title={`Level ${level} · ${progress.totalXp} XP`}
      >
        Lv{level}
      </span>
    );
  }

  // ── md size ─────────────────────────────────────────────────────────────
  return (
    <div className={`inline-flex flex-col items-start gap-0.5 ${className}`}>
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold leading-none tracking-wide bg-amber-500/15 text-amber-400 border border-amber-500/20 select-none"
        title={`Level ${level} · ${progress.totalXp} XP`}
      >
        Lv{level}
      </span>

      {showProgress && (
        <div className="w-full max-w-[72px] h-[3px] rounded-full bg-white/[0.06] overflow-hidden" title={`${progress.xpIntoCurrentLevel} / ${progress.xpRequiredForLevelUp} XP`}>
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-500/60 to-amber-400/80 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}
