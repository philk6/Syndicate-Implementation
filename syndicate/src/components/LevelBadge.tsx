'use client';

import { getRankProgress } from '@/lib/utils/xp';

interface LevelBadgeProps {
  totalXp: number;
  role?: string;
  size?: 'sm' | 'md';
  showProgress?: boolean;
  className?: string;
}

export function LevelBadge({
  totalXp,
  role,
  size = 'sm',
  showProgress = false,
  className = '',
}: LevelBadgeProps) {
  const { rank, progressPercent, xpIntoRank, xpToNextRank, nextRank } = getRankProgress(totalXp);
  const isAdmin = role === 'admin';
  const title = nextRank
    ? `${rank.name} · ${totalXp.toLocaleString()} XP · ${xpToNextRank.toLocaleString()} to ${nextRank.name}`
    : `${rank.name} · ${totalXp.toLocaleString()} XP · Max rank`;

  const pillStyle = {
    backgroundColor: `${rank.color}26`,
    color: rank.color,
    borderColor: `${rank.color}55`,
  };

  if (size === 'sm') {
    return (
      <span className={`inline-flex items-center gap-1 ${className}`}>
        {isAdmin && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold leading-none tracking-wide border select-none bg-[#FF6B35]/15 text-[#FF6B35] border-[#FF6B35]/40">
            Admin
          </span>
        )}
        <span
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold leading-none tracking-wide border select-none"
          style={pillStyle}
          title={title}
        >
          {rank.name}
        </span>
      </span>
    );
  }

  return (
    <div className={`inline-flex flex-col items-start gap-1 ${className}`}>
      {isAdmin && (
        <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-bold leading-none tracking-wide border select-none bg-[#FF6B35]/15 text-[#FF6B35] border-[#FF6B35]/40">
          Admin
        </span>
      )}
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold leading-none tracking-wide border select-none"
        style={pillStyle}
        title={title}
      >
        {rank.name}
      </span>

      {showProgress && (
        <div
          className="w-full max-w-[96px] h-[3px] rounded-full bg-white/[0.06] overflow-hidden"
          title={nextRank ? `${xpIntoRank.toLocaleString()} / ${(nextRank.min_xp - rank.min_xp).toLocaleString()} XP to next rank` : 'Max rank'}
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${progressPercent}%`,
              backgroundColor: rank.color,
            }}
          />
        </div>
      )}
    </div>
  );
}
