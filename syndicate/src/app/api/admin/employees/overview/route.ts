import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assertRoleForRoute } from '@/lib/authz';
import { payPeriodRange } from '@/lib/timeTracking';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/admin/employees/overview
// Feeds Live Status + Roster tabs in one round-trip.
export async function GET() {
  try {
    await assertRoleForRoute('admin');
    const svc = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
    );

    const [rangeStart, rangeEnd] = payPeriodRange(new Date());

    const [empsRes, openRes, weekRes, ratesRes, usersRes] = await Promise.all([
      svc.from('employees').select('id, user_id, first_name, last_name, active, employment_start_date, created_at'),
      svc.from('time_entries').select('id, employee_id, started_at, task, order_id').is('ended_at', null),
      svc.from('time_entries').select('employee_id, started_at, ended_at, task')
        .gte('started_at', rangeStart.toISOString()).lt('started_at', rangeEnd.toISOString()),
      svc.from('employee_rates').select('employee_id, hourly_rate, effective_from'),
      svc.from('users').select('user_id, email'),
    ]);

    const emailByUser = new Map<string, string>((usersRes.data ?? []).map((u) => [u.user_id as string, u.email as string]));

    // Current rate per employee = most recent rate row whose effective_from <= now.
    const now = new Date();
    const rateByEmployee = new Map<string, number>();
    for (const r of ratesRes.data ?? []) {
      if (new Date(r.effective_from as string) > now) continue;
      const cur = rateByEmployee.get(r.employee_id as string);
      if (cur == null) {
        rateByEmployee.set(r.employee_id as string, Number(r.hourly_rate));
      }
      // First match wins since postgrest returns unsorted; take the latest by sorting first.
    }
    // More correct approach: sort rates DESC by effective_from once.
    const sortedRates = (ratesRes.data ?? [])
      .filter((r) => new Date(r.effective_from as string) <= now)
      .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1));
    rateByEmployee.clear();
    for (const r of sortedRates) {
      if (!rateByEmployee.has(r.employee_id as string)) {
        rateByEmployee.set(r.employee_id as string, Number(r.hourly_rate));
      }
    }

    // Total hours this week per employee
    const weekHoursByEmployee = new Map<string, number>();
    for (const e of weekRes.data ?? []) {
      const start = new Date(e.started_at as string);
      const end = e.ended_at ? new Date(e.ended_at as string) : new Date();
      const hours = Math.max(0, (end.getTime() - start.getTime()) / 3600000);
      weekHoursByEmployee.set(
        e.employee_id as string,
        (weekHoursByEmployee.get(e.employee_id as string) ?? 0) + hours,
      );
    }

    const openByEmployee = new Map<string, { id: string; started_at: string; task: string; order_id: number | null }>(
      (openRes.data ?? []).map((o) => [
        o.employee_id as string,
        {
          id: o.id as string,
          started_at: o.started_at as string,
          task: o.task as string,
          order_id: (o.order_id as number | null) ?? null,
        },
      ]),
    );

    const employees = (empsRes.data ?? []).map((e) => ({
      id: e.id,
      user_id: e.user_id,
      email: emailByUser.get(e.user_id as string) ?? null,
      first_name: e.first_name,
      last_name: e.last_name,
      active: e.active,
      start_date: e.employment_start_date,
      rate: rateByEmployee.get(e.id as string) ?? null,
      hours_this_week: weekHoursByEmployee.get(e.id as string) ?? 0,
      open_entry: openByEmployee.get(e.id as string) ?? null,
    }));

    return NextResponse.json({ data: { employees, payPeriodStart: rangeStart.toISOString(), payPeriodEnd: rangeEnd.toISOString() } });
  } catch (e) {
    if (e instanceof Error && e.message === 'Not authenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    console.error('[GET /api/admin/employees/overview]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
