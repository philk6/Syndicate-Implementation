'use client';

import { RANKS, getRankForXp } from '@/lib/utils/xp';

interface RankBarProps {
  totalXp: number;
}

export function RankBar({ totalXp }: RankBarProps) {
  const currentRank = getRankForXp(totalXp);

  return (
    <div className="w-full overflow-x-auto pb-2 -mx-2 px-2 [scrollbar-width:thin]">
      <div className="flex items-stretch gap-2 min-w-max">
        {RANKS.map((r) => {
          const isCurrent = r.id === currentRank.id;
          const isReached = totalXp >= r.min_xp;
          const isFuture = !isReached;

          return (
            <div
              key={r.id}
              className="flex flex-col items-start gap-1 px-3 py-2 rounded-xl border backdrop-blur-sm transition-all relative min-w-[108px]"
              style={{
                borderColor: isCurrent ? r.color : isReached ? `${r.color}55` : 'rgba(255,255,255,0.08)',
                backgroundColor: isCurrent
                  ? `${r.color}1a`
                  : isReached
                  ? `${r.color}0d`
                  : 'rgba(255,255,255,0.02)',
                boxShadow: isCurrent ? `0 0 24px ${r.color}66, inset 0 0 12px ${r.color}22` : 'none',
              }}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    backgroundColor: isFuture ? 'rgba(255,255,255,0.18)' : r.color,
                    boxShadow: isCurrent ? `0 0 8px ${r.color}` : 'none',
                  }}
                />
                <span
                  className="text-[10px] font-bold uppercase tracking-wider"
                  style={{
                    color: isFuture ? 'rgba(255,255,255,0.35)' : r.color,
                    opacity: isFuture ? 0.7 : 1,
                  }}
                >
                  {r.name}
                </span>
              </div>
              <span
                className="text-[10px] font-mono tabular-nums"
                style={{ color: isFuture ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.55)' }}
              >
                {r.min_xp.toLocaleString()} XP
              </span>
              {isCurrent && (
                <span
                  className="absolute -top-1.5 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest"
                  style={{
                    backgroundColor: r.color,
                    color: '#0a0a0f',
                  }}
                >
                  You
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
