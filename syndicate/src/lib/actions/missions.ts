'use server';

import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Supabase service-role client (bypasses RLS — server-only)
// ---------------------------------------------------------------------------
const getSupabaseService = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, supabaseServiceKey);
};

async function verifyAdmin(userId: string) {
  const supabase = getSupabaseService();
  const { data, error } = await supabase
    .from('users')
    .select('role')
    .eq('user_id', userId)
    .single();

  if (error || data?.role !== 'admin') {
    throw new Error('Unauthorized: Admin access required');
  }
}

// ---------------------------------------------------------------------------
// awardMissionXP
// ---------------------------------------------------------------------------
/**
 * Awards the XP reward of a completed mission to a user.
 *
 * Guards:
 *  1. Caller must be an admin.
 *  2. The mission must exist.
 *  3. A duplicate XP transaction for the same user + mission is prevented.
 *
 * Runs with the Supabase **service-role** key so users cannot call it from
 * the client or manipulate the XP ledger directly.
 *
 * @param adminUserId - The user_id of the admin performing the action.
 * @param userId      - The user_id of the user receiving XP.
 * @param missionId   - The id of the completed mission.
 */
export async function awardMissionXP(
  adminUserId: string,
  userId: string,
  missionId: number,
) {
  // 1. Verify the caller is an admin
  await verifyAdmin(adminUserId);

  const supabase = getSupabaseService();

  // 2. Fetch the mission's xp_reward
  const { data: mission, error: missionError } = await supabase
    .from('missions')
    .select('id, xp_reward, title')
    .eq('id', missionId)
    .single();

  if (missionError || !mission) {
    throw new Error(`Mission not found (id: ${missionId})`);
  }

  if (mission.xp_reward <= 0) {
    throw new Error('Mission has no XP reward to grant.');
  }

  // 3. Guard: check if XP was already awarded for this user + mission
  const { data: existing } = await supabase
    .from('xp_transactions')
    .select('id')
    .eq('user_id', userId)
    .eq('source', 'mission_completion')
    .eq('reference_id', missionId)
    .maybeSingle();

  if (existing) {
    throw new Error(
      `XP for mission "${mission.title}" has already been awarded to this user.`,
    );
  }

  // 4. Insert the XP transaction
  const { error: insertError } = await supabase
    .from('xp_transactions')
    .insert({
      user_id: userId,
      amount: mission.xp_reward,
      source: 'mission_completion',
      reference_id: missionId,
    });

  if (insertError) {
    throw new Error(`Failed to award XP: ${insertError.message}`);
  }

  return { awarded: mission.xp_reward, missionTitle: mission.title };
}

// ---------------------------------------------------------------------------
// adjustXP  (manual XP adjustment by admin)
// ---------------------------------------------------------------------------
/**
 * Manually adjust a user's XP (positive or negative).
 *
 * @param adminUserId - The admin performing the adjustment.
 * @param userId      - The target user.
 * @param amount      - XP delta (positive to grant, negative to deduct).
 */
export async function adjustXP(
  adminUserId: string,
  userId: string,
  amount: number,
) {
  await verifyAdmin(adminUserId);

  if (amount === 0) {
    throw new Error('Adjustment amount cannot be zero.');
  }

  const supabase = getSupabaseService();

  const { error } = await supabase.from('xp_transactions').insert({
    user_id: userId,
    amount,
    source: 'manual_adjustment',
    reference_id: null,
  });

  if (error) {
    throw new Error(`Failed to adjust XP: ${error.message}`);
  }

  return { adjusted: amount };
}

// ---------------------------------------------------------------------------
// getUserXP  (read a user's total XP)
// ---------------------------------------------------------------------------
/**
 * Fetch a user's total XP by summing their xp_transactions.
 */
export async function getUserXP(userId: string): Promise<number> {
  const supabase = getSupabaseService();

  const { data, error } = await supabase
    .from('xp_transactions')
    .select('amount')
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to fetch XP: ${error.message}`);
  }

  return (data ?? []).reduce((sum, row) => sum + row.amount, 0);
}
