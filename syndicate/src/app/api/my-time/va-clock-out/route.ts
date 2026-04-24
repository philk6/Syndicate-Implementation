import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assertRoleForRoute } from '@/lib/authz';
import { businessDateKey, payPeriodRange, type TaskType, TASK_TYPES } from '@/lib/timeTracking';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/my-time/va-clock-out
// Body: { accomplishments, stuck_on?, tomorrow_plan? }
// - Closes the VA's currently-open time entry
// - Upserts today's row in va_daily_reports (unique on (employee_id, date)):
//     * If no row yet → insert
//     * If a row exists → APPEND new accomplishments separated by "---"
//       so a VA clocking back in + out again adds to today's report
//       rather than overwriting it.
// - hours_summary_json snapshots all of today's closed entries, grouped
//   by task type, for audit even if entries are edited later.
// Returns the upserted report row so the UI can confirm.
export async function POST(req: NextRequest) {
  try {
    const me = await assertRoleForRoute('va');

    const body = await req.json().catch(() => ({}));
    const accomplishments = (body.accomplishments ?? '').toString().trim();
    const stuckOn = typeof body.stuck_on === 'string' && body.stuck_on.trim() ? body.stuck_on.trim() : null;
    const tomorrowPlan = typeof body.tomorrow_plan === 'string' && body.tomorrow_plan.trim() ? body.tomorrow_plan.trim() : null;

    if (accomplishments.length < 20) {
      return NextResponse.json({ error: 'accomplishments must be at least 20 characters' }, { status: 400 });
    }
    if (accomplishments.length > 2000) {
      return NextResponse.json({ error: 'accomplishments must be 2000 characters or fewer' }, { status: 400 });
    }
    if (stuckOn && stuckOn.length > 1000) {
      return NextResponse.json({ error: 'stuck_on must be 1000 characters or fewer' }, { status: 400 });
    }
    if (tomorrowPlan && tomorrowPlan.length > 1000) {
      return NextResponse.json({ error: 'tomorrow_plan must be 1000 characters or fewer' }, { status: 400 });
    }

    const svc = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
    );

    const { data: employee } = await svc
      .from('employees')
      .select('id, active')
      .eq('user_id', me.user_id)
      .maybeSingle();
    if (!employee) return NextResponse.json({ error: 'No employee record' }, { status: 404 });
    if (!employee.active) return NextResponse.json({ error: 'Your account is inactive' }, { status: 403 });

    // Close the open entry (if any).
    const { data: open } = await svc
      .from('time_entries')
      .select('id')
      .eq('employee_id', employee.id)
      .is('ended_at', null)
      .limit(1)
      .maybeSingle();
    if (open) {
      const { error: closeErr } = await svc
        .from('time_entries')
        .update({ ended_at: new Date().toISOString() })
        .eq('id', open.id);
      if (closeErr) return NextResponse.json({ error: `close entry: ${closeErr.message}` }, { status: 500 });
    }

    // Build today's hours summary (post-close so the open-then-closed entry is counted).
    const reportDate = businessDateKey(new Date());
    const [rangeStart, rangeEnd] = payPeriodRange(new Date());
    // Use the pay-period bounds, then filter to today-in-Chicago client-side.
    const { data: weekEntries } = await svc
      .from('time_entries')
      .select('started_at, ended_at, task')
      .eq('employee_id', employee.id)
      .gte('started_at', rangeStart.toISOString())
      .lt('started_at', rangeEnd.toISOString());
    const todayEntries = (weekEntries ?? []).filter((e) => businessDateKey(new Date(e.started_at as string)) === reportDate);

    const emptyByTask = Object.fromEntries(TASK_TYPES.map((t) => [t, 0])) as Record<TaskType, number>;
    const byTask = { ...emptyByTask };
    let totalHours = 0;
    for (const e of todayEntries) {
      if (!e.ended_at) continue;
      const hrs = Math.max(0, (new Date(e.ended_at as string).getTime() - new Date(e.started_at as string).getTime()) / 3600000);
      byTask[e.task as TaskType] += hrs;
      totalHours += hrs;
    }
    const hoursSummary = { date: reportDate, total: totalHours, byTask };

    // Upsert the report.
    const { data: existing } = await svc
      .from('va_daily_reports')
      .select('id, accomplishments, stuck_on, tomorrow_plan')
      .eq('employee_id', employee.id)
      .eq('report_date', reportDate)
      .maybeSingle();

    let report: unknown;
    if (existing) {
      const joined = `${existing.accomplishments}\n\n--- later ---\n\n${accomplishments}`;
      const finalAccomplishments = joined.length > 2000 ? joined.slice(0, 2000) : joined;
      const nextStuck = stuckOn ?? existing.stuck_on;
      const nextPlan = tomorrowPlan ?? existing.tomorrow_plan;
      const { data, error } = await svc
        .from('va_daily_reports')
        .update({
          accomplishments: finalAccomplishments,
          stuck_on: nextStuck,
          tomorrow_plan: nextPlan,
          hours_summary_json: hoursSummary,
          edited_by: me.user_id,
          edited_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) return NextResponse.json({ error: `append report: ${error.message}` }, { status: 500 });
      report = data;
    } else {
      const { data, error } = await svc
        .from('va_daily_reports')
        .insert({
          employee_id: employee.id,
          report_date: reportDate,
          accomplishments,
          stuck_on: stuckOn,
          tomorrow_plan: tomorrowPlan,
          hours_summary_json: hoursSummary,
        })
        .select()
        .single();
      if (error) return NextResponse.json({ error: `insert report: ${error.message}` }, { status: 500 });
      report = data;
    }

    return NextResponse.json({ data: { report } });
  } catch (e) {
    if (e instanceof Error && e.message === 'Not authenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (e instanceof Error && e.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    console.error('[POST /api/my-time/va-clock-out]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
