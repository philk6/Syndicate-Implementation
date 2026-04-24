import { NextRequest, NextResponse } from 'next/server';
import { resolveTeamContext } from '@/lib/myTeam';
import { TASK_TYPES, type TaskType, zonedWallClockToUtc } from '@/lib/timeTracking';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/my-team/hours-report?teamId=&from=YYYY-MM-DD&to=YYYY-MM-DD
// Per-VA totals + per-task breakdown + rate effective for the period +
// gross pay. Same shape as the admin hours report but scoped to the team.
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const teamId = url.searchParams.get('teamId') ?? undefined;
    const fromStr = url.searchParams.get('from') ?? '';
    const toStr = url.searchParams.get('to') ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromStr) || !/^\d{4}-\d{2}-\d{2}$/.test(toStr)) {
      return NextResponse.json({ error: 'from and to must be YYYY-MM-DD' }, { status: 400 });
    }

    const { svc, team } = await resolveTeamContext(teamId);
    const [fy, fm, fd] = fromStr.split('-').map(Number);
    const [ty, tm, td] = toStr.split('-').map(Number);
    const startUtc = zonedWallClockToUtc(fy, fm, fd, 0, 0, 0);
    const endUtcExclusive = zonedWallClockToUtc(ty, tm, td + 1, 0, 0, 0);

    const [empsRes, usersRes, ratesRes] = await Promise.all([
      svc.from('employees').select('id, user_id, first_name, last_name, active, va_profile').eq('team_id', team.id),
      svc.from('users').select('user_id, email'),
      svc.from('employee_rates').select('employee_id, hourly_rate, effective_from'),
    ]);

    const empIds = (empsRes.data ?? []).map((e) => e.id as string);
    const { data: entries } = await svc
      .from('time_entries')
      .select('employee_id, started_at, ended_at, task')
      .in('employee_id', empIds.length ? empIds : ['00000000-0000-0000-0000-000000000000'])
      .gte('started_at', startUtc.toISOString())
      .lt('started_at', endUtcExclusive.toISOString());

    const emailByUser = new Map<string, string>((usersRes.data ?? []).map((u) => [u.user_id as string, u.email as string]));

    const rateByEmployee = new Map<string, number>();
    const sortedRates = (ratesRes.data ?? [])
      .filter((r) => new Date(r.effective_from as string) <= startUtc)
      .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1));
    for (const r of sortedRates) {
      if (!rateByEmployee.has(r.employee_id as string)) {
        rateByEmployee.set(r.employee_id as string, Number(r.hourly_rate));
      }
    }

    interface Agg { total: number; byTask: Record<TaskType, number>; unresolved: number; }
    const emptyAgg = (): Agg => ({
      total: 0,
      byTask: { prep: 0, shipping: 0, labeling: 0, receiving_order: 0, receiving_general: 0, cleaning: 0, break: 0, other: 0 },
      unresolved: 0,
    });
    const byEmp = new Map<string, Agg>();
    for (const e of entries ?? []) {
      const key = e.employee_id as string;
      if (!byEmp.has(key)) byEmp.set(key, emptyAgg());
      const a = byEmp.get(key)!;
      if (!e.ended_at) { a.unresolved += 1; continue; }
      const hrs = Math.max(0, (new Date(e.ended_at as string).getTime() - new Date(e.started_at as string).getTime()) / 3600000);
      a.total += hrs;
      a.byTask[e.task as TaskType] += hrs;
    }

    const rows = (empsRes.data ?? []).map((emp) => {
      const agg = byEmp.get(emp.id as string) ?? emptyAgg();
      const rate = rateByEmployee.get(emp.id as string) ?? 0;
      return {
        employee_id: emp.id,
        first_name: emp.first_name,
        last_name: emp.last_name,
        email: emailByUser.get(emp.user_id as string) ?? '',
        active: emp.active,
        va_profile: emp.va_profile,
        total_hours: agg.total,
        by_task: agg.byTask,
        unresolved_entries: agg.unresolved,
        hourly_rate: rate,
        gross_pay: agg.total * rate,
      };
    }).sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return b.total_hours - a.total_hours;
    });

    return NextResponse.json({ data: { from: fromStr, to: toStr, task_types: TASK_TYPES, rows } });
  } catch (e) {
    if (e instanceof Error && e.message === 'Not authenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error('[GET /api/my-team/hours-report]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
