import { NextRequest, NextResponse } from 'next/server';
import { resolveTeamContext } from '@/lib/myTeam';
import { type TaskType, zonedWallClockToUtc } from '@/lib/timeTracking';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/my-team/hours-by-project?teamId=&from=YYYY-MM-DD&to=YYYY-MM-DD
// Aggregates labor hours by project_id for a team, with per-VA per-task
// sub-rows. Parallel to /api/admin/employees/hours-by-order.
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

    const [empsRes, projectsRes] = await Promise.all([
      svc.from('employees').select('id, first_name, last_name').eq('team_id', team.id),
      svc.from('team_projects').select('id, name').eq('team_id', team.id),
    ]);

    const empIds = (empsRes.data ?? []).map((e) => e.id as string);
    if (empIds.length === 0) {
      return NextResponse.json({ data: { from: fromStr, to: toStr, rows: [] } });
    }

    const { data: entries } = await svc
      .from('time_entries')
      .select('employee_id, started_at, ended_at, task, project_id')
      .in('employee_id', empIds)
      .not('project_id', 'is', null)
      .gte('started_at', startUtc.toISOString())
      .lt('started_at', endUtcExclusive.toISOString());

    const empName = new Map<string, string>((empsRes.data ?? []).map((e) => [e.id as string, `${e.first_name} ${e.last_name}`]));
    const projName = new Map<string, string>((projectsRes.data ?? []).map((p) => [p.id as string, p.name as string]));

    interface EmpAgg { employee_id: string; name: string; total: number; byTask: Record<string, number>; }
    interface ProjAgg { project_id: string; name: string; total: number; perEmployee: Map<string, EmpAgg>; }
    const byProj = new Map<string, ProjAgg>();

    for (const e of entries ?? []) {
      if (!e.ended_at || !e.project_id) continue;
      const hours = Math.max(0, (new Date(e.ended_at as string).getTime() - new Date(e.started_at as string).getTime()) / 3600000);
      const pid = e.project_id as string;
      if (!byProj.has(pid)) {
        byProj.set(pid, { project_id: pid, name: projName.get(pid) ?? '(archived project)', total: 0, perEmployee: new Map() });
      }
      const agg = byProj.get(pid)!;
      agg.total += hours;
      const empKey = e.employee_id as string;
      if (!agg.perEmployee.has(empKey)) {
        agg.perEmployee.set(empKey, { employee_id: empKey, name: empName.get(empKey) ?? 'Unknown', total: 0, byTask: {} });
      }
      const empAgg = agg.perEmployee.get(empKey)!;
      empAgg.total += hours;
      empAgg.byTask[e.task as TaskType] = (empAgg.byTask[e.task as TaskType] ?? 0) + hours;
    }

    const rows = Array.from(byProj.values())
      .map((p) => ({
        project_id: p.project_id,
        name: p.name,
        total_hours: p.total,
        per_employee: Array.from(p.perEmployee.values()).sort((a, b) => b.total - a.total),
      }))
      .sort((a, b) => b.total_hours - a.total_hours);

    return NextResponse.json({ data: { from: fromStr, to: toStr, rows } });
  } catch (e) {
    if (e instanceof Error && e.message === 'Not authenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error('[GET /api/my-team/hours-by-project]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
