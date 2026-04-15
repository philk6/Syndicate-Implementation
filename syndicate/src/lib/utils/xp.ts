/**
 * XP → Rank utilities.
 *
 * Rank tiers (mirror of public.ranks table; duplicated here for sync
 * client-side use).
 */

export interface Rank {
  id: number;
  name: string;
  min_xp: number;
  color: string;
}

export const RANKS: Rank[] = [
  { id: 1, name: 'Recruit',          min_xp:      0, color: '#888888' },
  { id: 2, name: 'Hustler',          min_xp:   1000, color: '#FF6B35' },
  { id: 3, name: 'Operator',         min_xp:   5000, color: '#4ECDC4' },
  { id: 4, name: 'Merchant',         min_xp:  15000, color: '#A8E6CF' },
  { id: 5, name: 'Distributor',      min_xp:  35000, color: '#FFD93D' },
  { id: 6, name: 'Mogul',            min_xp:  75000, color: '#C77DFF' },
  { id: 7, name: 'Syndicate Elite',  min_xp: 150000, color: '#FF0080' },
];

export function getRankForXp(totalXp: number): Rank {
  const xp = Math.max(0, totalXp);
  let current = RANKS[0];
  for (const r of RANKS) {
    if (xp >= r.min_xp) current = r;
    else break;
  }
  return current;
}

export function getNextRank(totalXp: number): Rank | null {
  const current = getRankForXp(totalXp);
  const nextIndex = RANKS.findIndex((r) => r.id === current.id) + 1;
  return RANKS[nextIndex] ?? null;
}

export function getXpProgressPercent(totalXp: number): number {
  const current = getRankForXp(totalXp);
  const next = getNextRank(totalXp);
  if (!next) return 100;
  const span = next.min_xp - current.min_xp;
  if (span <= 0) return 100;
  return Math.min(100, Math.round(((totalXp - current.min_xp) / span) * 100));
}

export function getRankProgress(totalXp: number) {
  const current = getRankForXp(totalXp);
  const next = getNextRank(totalXp);
  return {
    totalXp,
    rank: current,
    nextRank: next,
    xpIntoRank: totalXp - current.min_xp,
    xpToNextRank: next ? next.min_xp - totalXp : 0,
    progressPercent: getXpProgressPercent(totalXp),
  };
}
