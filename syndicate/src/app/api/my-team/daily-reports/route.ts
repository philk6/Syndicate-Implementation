import { NextRequest, NextResponse } from 'next/server';
import { resolveTeamContext } from '@/lib/myTeam';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/my-team/daily-reports?teamId=&employeeId=&from=YYYY-MM-DD&to=YYYY-MM-DD&q=...
// Returns va_daily_reports scoped to the team, optionally filtered by
// employee, date range (inclusive on both ends), and a full-text search
// substring applied against accomplishments/stuck_on/tomorrow_plan.
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const teamId = url.searchParams.get('teamId') ?? undefined;
    const employeeId = url.searchParams.get('employeeId') ?? '';
    const fromStr = url.searchParams.get('from') ?? '';
    const toStr = url.searchParams.get('to') ?? '';
    const q = (url.searchParams.get('q') ?? '').trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromStr) || !/^\d{4}-\d{2}-\d{2}$/.test(toStr)) {
      return NextResponse.json({ error: 'from and to must be YYYY-MM-DD' }, { status: 400 });
    }

    const { svc, team } = await resolveTeamContext(teamId);

    const { data: emps } = await svc
      .from('employees')
      .select('id, first_name, last_name')
      .eq('team_id', team.id);
    const empIds = (emps ?? []).map((e) => e.id as string);
    if (empIds.length === 0) return NextResponse.json({ data: { rows: [] } });

    let query = svc
      .from('va_daily_reports')
      .select('id, employee_id, report_date, accomplishments, stuck_on, tomorrow_plan, submitted_at, edited_at')
      .in('employee_id', empIds)
      .gte('report_date', fromStr)
      .lte('report_date', toStr)
      .order('report_date', { ascending: false })
      .order('submitted_at', { ascending: false });

    if (employeeId) query = query.eq('employee_id', employeeId);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const empName = new Map<string, string>((emps ?? []).map((e) => [e.id as string, `${e.first_name} ${e.last_name}`]));

    let rows = (data ?? []).map((r) => ({
      id: r.id,
      employee_id: r.employee_id,
      employee_name: empName.get(r.employee_id as string) ?? 'Unknown',
      report_date: r.report_date,
      accomplishments: r.accomplishments,
      stuck_on: r.stuck_on,
      tomorrow_plan: r.tomorrow_plan,
      submitted_at: r.submitted_at,
      edited_at: r.edited_at,
    }));

    if (q) {
      const needle = q.toLowerCase();
      rows = rows.filter((r) =>
        (r.accomplishments ?? '').toLowerCase().includes(needle) ||
        (r.stuck_on ?? '').toLowerCase().includes(needle) ||
        (r.tomorrow_plan ?? '').toLowerCase().includes(needle),
      );
    }

    return NextResponse.json({ data: { rows } });
  } catch (e) {
    if (e instanceof Error && e.message === 'Not authenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error('[GET /api/my-team/daily-reports]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
