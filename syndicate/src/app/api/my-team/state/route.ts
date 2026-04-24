import { NextRequest, NextResponse } from 'next/server';
import { resolveTeamContext } from '@/lib/myTeam';
import { payPeriodRange } from '@/lib/timeTracking';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/my-team/state?teamId=...
// One-shot fetch for the VAs roster + Projects list + team header.
// `teamId` is optional — when omitted, resolves to the calling student's
// own team. When present, admins see that team and students must own it.
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const teamId = url.searchParams.get('teamId') ?? undefined;
    const { user, svc, team, isAdminImpersonating } = await resolveTeamContext(teamId);

    const [empsRes, usersRes, ratesRes, projectsRes, weekRes] = await Promise.all([
      svc.from('employees')
        .select('id, user_id, first_name, last_name, active, va_profile, employment_start_date')
        .eq('team_id', team.id),
      svc.from('users').select('user_id, email'),
      svc.from('employee_rates').select('employee_id, hourly_rate, effective_from'),
      svc.from('team_projects')
        .select('id, name, description, active, created_at, archived_at')
        .eq('team_id', team.id)
        .order('created_at', { ascending: false }),
      // Hours this week by employee (for the roster column)
      (async () => {
        const [rs, re] = payPeriodRange(new Date());
        return svc.from('time_entries')
          .select('employee_id, started_at, ended_at')
          .gte('started_at', rs.toISOString()).lt('started_at', re.toISOString());
      })(),
    ]);

    const emailByUser = new Map<string, string>((usersRes.data ?? []).map((u) => [u.user_id as string, u.email as string]));

    const now = new Date();
    const rateByEmployee = new Map<string, number>();
    const sortedRates = (ratesRes.data ?? [])
      .filter((r) => new Date(r.effective_from as string) <= now)
      .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1));
    for (const r of sortedRates) {
      if (!rateByEmployee.has(r.employee_id as string)) {
        rateByEmployee.set(r.employee_id as string, Number(r.hourly_rate));
      }
    }

    const hoursByEmployee = new Map<string, number>();
    for (const e of weekRes.data ?? []) {
      const start = new Date(e.started_at as string);
      const end = e.ended_at ? new Date(e.ended_at as string) : new Date();
      const hrs = Math.max(0, (end.getTime() - start.getTime()) / 3600000);
      hoursByEmployee.set(
        e.employee_id as string,
        (hoursByEmployee.get(e.employee_id as string) ?? 0) + hrs,
      );
    }

    const vas = (empsRes.data ?? [])
      .map((e) => ({
        id: e.id,
        user_id: e.user_id,
        email: emailByUser.get(e.user_id as string) ?? null,
        first_name: e.first_name,
        last_name: e.last_name,
        active: e.active,
        start_date: e.employment_start_date,
        va_profile: e.va_profile,
        rate: rateByEmployee.get(e.id as string) ?? null,
        hours_this_week: hoursByEmployee.get(e.id as string) ?? 0,
      }))
      .sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1;
        return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
      });

    return NextResponse.json({
      data: {
        team,
        isAdminImpersonating,
        caller: { user_id: user.user_id, email: user.email, role: user.role },
        vas,
        projects: projectsRes.data ?? [],
      },
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'Not authenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (e instanceof Error && e.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (e instanceof Error && e.message === 'Team not found') {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }
    if (e instanceof Error && e.message === 'No team found for current user') {
      return NextResponse.json({ error: 'No team found for this user' }, { status: 404 });
    }
    console.error('[GET /api/my-team/state]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
