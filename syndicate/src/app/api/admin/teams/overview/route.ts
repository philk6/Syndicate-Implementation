import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assertRoleForRoute } from '@/lib/authz';
import { payPeriodRange } from '@/lib/timeTracking';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/admin/teams/overview
// Cross-team aggregates + per-team roll-ups for /admin/teams.
export async function GET() {
  try {
    await assertRoleForRoute('admin');
    const svc = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
    );

    const [rangeStart, rangeEnd] = payPeriodRange(new Date());

    const [teamsRes, empsRes, usersRes, entriesRes, projectsRes] = await Promise.all([
      svc.from('teams').select('id, name, owner_id, is_warehouse, created_at'),
      svc.from('employees').select('id, team_id, user_id, active, va_profile'),
      svc.from('users').select('user_id, email, firstname, lastname'),
      svc.from('time_entries').select('employee_id, started_at, ended_at, order_id, project_id')
        .gte('started_at', rangeStart.toISOString()).lt('started_at', rangeEnd.toISOString()),
      svc.from('team_projects').select('id, team_id, name, active'),
    ]);

    const userById = new Map<string, { email: string; first: string | null; last: string | null }>(
      (usersRes.data ?? []).map((u) => [u.user_id as string, {
        email: u.email as string,
        first: (u.firstname as string | null) ?? null,
        last: (u.lastname as string | null) ?? null,
      }]),
    );

    const empById = new Map<string, { team_id: string; active: boolean; va_profile: string | null }>(
      (empsRes.data ?? []).map((e) => [e.id as string, {
        team_id: e.team_id as string,
        active: Boolean(e.active),
        va_profile: (e.va_profile as string | null) ?? null,
      }]),
    );

    const teamRollup = new Map<string, {
      team_id: string; name: string; owner_name: string; owner_email: string; is_warehouse: boolean;
      active_staff: number; active_vas: number; active_employees: number;
      hours_this_week: number;
    }>();

    for (const t of teamsRes.data ?? []) {
      const owner = userById.get(t.owner_id as string);
      teamRollup.set(t.id as string, {
        team_id: t.id as string,
        name: t.name as string,
        owner_name: owner ? `${owner.first ?? ''} ${owner.last ?? ''}`.trim() || (owner.email?.split('@')[0] ?? 'Owner') : 'Unknown',
        owner_email: owner?.email ?? '',
        is_warehouse: Boolean(t.is_warehouse),
        active_staff: 0, active_vas: 0, active_employees: 0,
        hours_this_week: 0,
      });
    }

    for (const e of empsRes.data ?? []) {
      if (!e.active) continue;
      const row = teamRollup.get(e.team_id as string);
      if (!row) continue;
      row.active_staff += 1;
      if (e.va_profile) row.active_vas += 1;
      else row.active_employees += 1;
    }

    let platformHoursThisPeriod = 0;
    const orderHours = new Map<number, number>();
    const projectHours = new Map<string, { name: string; hours: number }>();
    const projectById = new Map<string, { team_id: string; name: string }>(
      (projectsRes.data ?? []).map((p) => [p.id as string, { team_id: p.team_id as string, name: p.name as string }]),
    );

    for (const e of entriesRes.data ?? []) {
      if (!e.ended_at) continue;
      const hrs = Math.max(0, (new Date(e.ended_at as string).getTime() - new Date(e.started_at as string).getTime()) / 3600000);
      platformHoursThisPeriod += hrs;
      const emp = empById.get(e.employee_id as string);
      if (emp) {
        const tr = teamRollup.get(emp.team_id);
        if (tr) tr.hours_this_week += hrs;
      }
      if (e.order_id) orderHours.set(e.order_id as number, (orderHours.get(e.order_id as number) ?? 0) + hrs);
      if (e.project_id) {
        const p = projectById.get(e.project_id as string);
        projectHours.set(e.project_id as string, {
          name: p?.name ?? '(archived)',
          hours: (projectHours.get(e.project_id as string)?.hours ?? 0) + hrs,
        });
      }
    }

    const topProjects = Array.from(projectHours.entries())
      .map(([id, v]) => ({ project_id: id, name: v.name, hours: v.hours }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 5);
    const topOrders = Array.from(orderHours.entries())
      .map(([id, h]) => ({ order_id: id, hours: h }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 5);

    const teams = Array.from(teamRollup.values()).sort((a, b) => {
      if (a.is_warehouse !== b.is_warehouse) return a.is_warehouse ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    const totalActiveVas = teams.reduce((s, t) => s + t.active_vas, 0);
    const totalActiveEmployees = teams.reduce((s, t) => s + t.active_employees, 0);

    return NextResponse.json({
      data: {
        pay_period_start: rangeStart.toISOString(),
        pay_period_end: rangeEnd.toISOString(),
        platform_hours_this_period: platformHoursThisPeriod,
        total_active_vas: totalActiveVas,
        total_active_employees: totalActiveEmployees,
        total_teams: teams.length,
        teams,
        top_projects: topProjects,
        top_orders: topOrders,
      },
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'Not authenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    console.error('[GET /api/admin/teams/overview]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
