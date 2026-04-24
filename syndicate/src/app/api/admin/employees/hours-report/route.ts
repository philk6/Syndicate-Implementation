import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assertRoleForRoute } from '@/lib/authz';
import { TASK_TYPES, type TaskType, zonedWallClockToUtc } from '@/lib/timeTracking';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/admin/employees/hours-report?from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns per-employee totals + per-task breakdown + rate effective for the
// period + gross pay. Date params are inclusive on both ends and interpreted
// as Chicago business dates.
export async function GET(req: NextRequest) {
  try {
    await assertRoleForRoute('admin');
    const url = new URL(req.url);
    const fromStr = url.searchParams.get('from') ?? '';
    const toStr = url.searchParams.get('to') ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromStr) || !/^\d{4}-\d{2}-\d{2}$/.test(toStr)) {
      return NextResponse.json({ error: 'from and to must be YYYY-MM-DD' }, { status: 400 });
    }
    const [fy, fm, fd] = fromStr.split('-').map(Number);
    const [ty, tm, td] = toStr.split('-').map(Number);
    const startUtc = zonedWallClockToUtc(fy, fm, fd, 0, 0, 0);
    const endUtcExclusive = zonedWallClockToUtc(ty, tm, td + 1, 0, 0, 0);

    const svc = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
    );

    const [empsRes, usersRes, entriesRes, ratesRes] = await Promise.all([
      svc.from('employees').select('id, user_id, first_name, last_name, active'),
      svc.from('users').select('user_id, email'),
      svc.from('time_entries').select('employee_id, started_at, ended_at, task, order_id')
        .gte('started_at', startUtc.toISOString()).lt('started_at', endUtcExclusive.toISOString()),
      svc.from('employee_rates').select('employee_id, hourly_rate, effective_from'),
    ]);

    const emailByUser = new Map<string, string>((usersRes.data ?? []).map((u) => [u.user_id as string, u.email as string]));

    // Rate effective for the period = most recent rate with effective_from <= start of period.
    const rateByEmployee = new Map<string, number>();
    const sortedRates = (ratesRes.data ?? [])
      .filter((r) => new Date(r.effective_from as string) <= startUtc)
      .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1));
    for (const r of sortedRates) {
      if (!rateByEmployee.has(r.employee_id as string)) {
        rateByEmployee.set(r.employee_id as string, Number(r.hourly_rate));
      }
    }

    interface Agg {
      total: number;
      byTask: Record<TaskType, number>;
      unresolved: number;
    }
    const emptyAgg = (): Agg => ({
      total: 0,
      byTask: {
        prep: 0, shipping: 0, labeling: 0, receiving_order: 0,
        receiving_general: 0, cleaning: 0, break: 0, other: 0,
      },
      unresolved: 0,
    });

    const byEmployee = new Map<string, Agg>();
    for (const e of entriesRes.data ?? []) {
      const key = e.employee_id as string;
      if (!byEmployee.has(key)) byEmployee.set(key, emptyAgg());
      const agg = byEmployee.get(key)!;
      if (!e.ended_at) { agg.unresolved += 1; continue; }
      const start = new Date(e.started_at as string);
      const end = new Date(e.ended_at as string);
      const hours = Math.max(0, (end.getTime() - start.getTime()) / 3600000);
      agg.total += hours;
      agg.byTask[e.task as TaskType] += hours;
    }

    const rows = (empsRes.data ?? []).map((emp) => {
      const agg = byEmployee.get(emp.id as string) ?? emptyAgg();
      const rate = rateByEmployee.get(emp.id as string) ?? 0;
      return {
        employee_id: emp.id,
        first_name: emp.first_name,
        last_name: emp.last_name,
        email: emailByUser.get(emp.user_id as string) ?? '',
        active: emp.active,
        total_hours: agg.total,
        by_task: agg.byTask,
        unresolved_entries: agg.unresolved,
        hourly_rate: rate,
        gross_pay: agg.total * rate,
      };
    });

    // Sort active first, then by total hours desc.
    rows.sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return b.total_hours - a.total_hours;
    });

    return NextResponse.json({
      data: {
        from: fromStr,
        to: toStr,
        task_types: TASK_TYPES,
        rows,
      },
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'Not authenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    console.error('[GET /api/admin/employees/hours-report]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
