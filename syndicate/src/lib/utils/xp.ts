/**
 * XP ↔ Level utilities
 *
 * Formula:  Total XP required for a level = 4.8 × level²
 *
 * This gives an infinite leveling curve where:
 *   Level 10  →    480 XP
 *   Level 25  →  3,000 XP
 *   Level 50  → 12,000 XP  (≈ 1 year target)
 */

const XP_SCALE = 4.8;

/**
 * Derive the current level from an accumulated XP total.
 *
 * Reverses the formula:  level = floor( sqrt( totalXp / 4.8 ) )
 *
 * @param totalXp - The user's cumulative XP (must be ≥ 0).
 * @returns The user's current level (0-indexed, so 0 XP = level 0).
 */
export function calculateLevelFromXP(totalXp: number): number {
  if (totalXp <= 0) return 0;
  return Math.floor(Math.sqrt(totalXp / XP_SCALE));
}

/**
 * Calculate the **total** XP required to reach the *next* level.
 *
 * @param currentLevel - The user's current level.
 * @returns Total XP threshold for `currentLevel + 1`.
 */
export function calculateXpForNextLevel(currentLevel: number): number {
  const nextLevel = currentLevel + 1;
  return Math.ceil(XP_SCALE * nextLevel * nextLevel);
}

/**
 * Convenience: return a snapshot of a user's leveling state.
 */
export function getLevelProgress(totalXp: number) {
  const level = calculateLevelFromXP(totalXp);
  const xpForCurrentLevel = Math.ceil(XP_SCALE * level * level);
  const xpForNextLevel = calculateXpForNextLevel(level);

  return {
    level,
    totalXp,
    /** XP the user has earned *within* the current level band. */
    xpIntoCurrentLevel: totalXp - xpForCurrentLevel,
    /** Total XP width of the current level band. */
    xpRequiredForLevelUp: xpForNextLevel - xpForCurrentLevel,
    /** Total XP needed to reach the next level. */
    xpForNextLevel,
  };
}
