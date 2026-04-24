import { NextRequest, NextResponse } from 'next/server';
import { resolveTeamContext } from '@/lib/myTeam';
import { businessDateKey } from '@/lib/timeTracking';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/my-team/live-status?teamId=
// Returns the team's VAs with currently open time entries, plus VAs with
// open entries whose started_at is BEFORE today (flagged as "needs
// end-of-day report").
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const teamId = url.searchParams.get('teamId') ?? undefined;
    const { svc, team } = await resolveTeamContext(teamId);

    const { data: employees } = await svc
      .from('employees')
      .select('id, user_id, first_name, last_name, va_profile, active')
      .eq('team_id', team.id);

    const empIds = (employees ?? []).map((e) => e.id as string);
    if (empIds.length === 0) {
      return NextResponse.json({ data: { live: [], needs_report: [] } });
    }

    const { data: openEntries } = await svc
      .from('time_entries')
      .select('id, employee_id, started_at, task, order_id, project_id')
      .in('employee_id', empIds)
      .is('ended_at', null);

    const { data: projects } = await svc
      .from('team_projects')
      .select('id, name')
      .eq('team_id', team.id);
    const projectNameById = new Map<string, string>((projects ?? []).map((p) => [p.id as string, p.name as string]));

    const empMap = new Map((employees ?? []).map((e) => [e.id as string, e]));
    const todayKey = businessDateKey(new Date());

    const live: Array<{
      employee_id: string; first_name: string; last_name: string; va_profile: string | null;
      started_at: string; task: string; order_id: number | null; project_id: string | null; project_name: string | null;
      needs_report: boolean;
    }> = [];
    const needsReport: typeof live = [];

    for (const e of openEntries ?? []) {
      const emp = empMap.get(e.employee_id as string);
      if (!emp) continue;
      const startedKey = businessDateKey(new Date(e.started_at as string));
      const needs = startedKey !== todayKey; // open entry from a prior day
      const row = {
        employee_id: e.employee_id as string,
        first_name: emp.first_name as string,
        last_name: emp.last_name as string,
        va_profile: emp.va_profile as string | null,
        started_at: e.started_at as string,
        task: e.task as string,
        order_id: (e.order_id as number | null) ?? null,
        project_id: (e.project_id as string | null) ?? null,
        project_name: e.project_id ? projectNameById.get(e.project_id as string) ?? null : null,
        needs_report: needs,
      };
      if (needs) needsReport.push(row);
      else live.push(row);
    }

    return NextResponse.json({ data: { live, needs_report: needsReport } });
  } catch (e) {
    if (e instanceof Error && e.message === 'Not authenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error('[GET /api/my-team/live-status]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
