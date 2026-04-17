import { supabase } from '@lib/supabase/client';

export interface WeeklyCheckin {
  id: number;
  user_id: string;
  company_id: number | null;
  week_start: string;
  accomplished: string;
  next_week_goal: string;
  suppliers_contacted: number;
  calls_made: number;
  submitted_at: string;
}

/** Returns the ISO-Monday of the week containing `d` as a YYYY-MM-DD string (UTC). */
export function getCurrentWeekStart(d: Date = new Date()): string {
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = (day + 6) % 7; // days since Monday
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff));
  return monday.toISOString().slice(0, 10);
}

export async function fetchThisWeekCheckin(userId: string): Promise<WeeklyCheckin | null> {
  const weekStart = getCurrentWeekStart();
  const { data, error } = await supabase
    .from('weekly_checkins')
    .select('*')
    .eq('user_id', userId)
    .eq('week_start', weekStart)
    .maybeSingle();
  if (error) throw error;
  return data as WeeklyCheckin | null;
}

export async function submitWeeklyCheckin(input: {
  userId: string;
  companyId: number | null;
  accomplished: string;
  nextWeekGoal: string;
  suppliersContacted: number;
  callsMade: number;
  eventCode: string; // e.g. 'phase1_weekly_checkin'
}) {
  const weekStart = getCurrentWeekStart();

  const { error: insertErr } = await supabase.from('weekly_checkins').insert({
    user_id: input.userId,
    company_id: input.companyId,
    week_start: weekStart,
    accomplished: input.accomplished,
    next_week_goal: input.nextWeekGoal,
    suppliers_contacted: input.suppliersContacted,
    calls_made: input.callsMade,
  });
  if (insertErr) throw insertErr;

  // Award XP via bonus event RPC. Non-fatal if it fails — check-in is still recorded.
  let awardedXp = 0;
  try {
    const { data, error } = await supabase
      .rpc('claim_bonus_xp', { p_event_code: input.eventCode, p_metadata: { week_start: weekStart } })
      .single<{ awarded_xp: number }>();
    if (error) throw error;
    awardedXp = data?.awarded_xp ?? 0;
  } catch (err) {
    console.warn('Weekly check-in saved but XP claim failed:', err);
  }

  return { weekStart, awardedXp };
}
