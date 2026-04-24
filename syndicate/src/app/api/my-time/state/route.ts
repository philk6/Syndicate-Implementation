import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assertRoleForRoute } from '@/lib/authz';
import { payPeriodRange, businessDateKey } from '@/lib/timeTracking';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/my-time/state
// One-shot fetch for the /my-time page — returns the caller's employee row,
// open entry, today + week entries, current rate, and the correct list of
// tags for their role:
//   - warehouse employee → orders (filtered to non-closed statuses)
//   - VA                 → team_projects (active) scoped to the VA's team
export async function GET() {
  try {
    const me = await assertRoleForRoute('admin-or-employee-or-va');

    const service = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
    );

    const { data: employee } = await service
      .from('employees')
      .select('id, first_name, last_name, active, employment_start_date, team_id, va_profile')
      .eq('user_id', me.user_id)
      .maybeSingle();

    // Admins/students without an employee row get a valid empty state; the
    // UI shows an explanatory message rather than breaking.
    if (!employee) {
      return NextResponse.json({
        data: {
          employee: null, openEntry: null, today: [], week: [],
          rate: null, orders: [], projects: [], todayReport: null,
          isVa: false,
        },
      });
    }

    const isVa = me.role === 'va';
    const [rangeStart, rangeEnd] = payPeriodRange(new Date());

    const [openRes, weekRes, rateRes, ordersRes, projectsRes, todayReportRes] = await Promise.all([
      service
        .from('time_entries')
        .select('id, started_at, ended_at, task, order_id, project_id, note')
        .eq('employee_id', employee.id)
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      service
        .from('time_entries')
        .select('id, started_at, ended_at, task, order_id, project_id, note')
        .eq('employee_id', employee.id)
        .gte('started_at', rangeStart.toISOString())
        .lt('started_at', rangeEnd.toISOString())
        .order('started_at', { ascending: true }),
      service
        .from('employee_rates')
        .select('hourly_rate, effective_from')
        .eq('employee_id', employee.id)
        .lte('effective_from', new Date().toISOString())
        .order('effective_from', { ascending: false })
        .limit(1)
        .maybeSingle(),
      // Only fetch orders for warehouse employees — VAs don't tag against
      // them, and the extra round-trip is pure waste for students/admins.
      isVa
        ? Promise.resolve({ data: [] as Array<{ order_id: number; order_statuses: unknown }>, error: null })
        : service
            .from('orders')
            .select('order_id, order_status_id, order_statuses(description)')
            .order('order_id', { ascending: false })
            .limit(200),
      // Active team_projects scoped to this employee's team. Warehouse
      // employees never see projects because their team is the Warehouse
      // singleton and no projects are created for it.
      service
        .from('team_projects')
        .select('id, name, description, active')
        .eq('team_id', employee.team_id)
        .eq('active', true)
        .order('name', { ascending: true }),
      // Has the VA already submitted today's daily report?
      (async () => {
        if (!isVa) return { data: null, error: null };
        const today = businessDateKey(new Date());
        return service
          .from('va_daily_reports')
          .select('id, accomplishments, stuck_on, tomorrow_plan, submitted_at')
          .eq('employee_id', employee.id)
          .eq('report_date', today)
          .maybeSingle();
      })(),
    ]);

    const todayKey = businessDateKey(new Date());
    const week = weekRes.data ?? [];
    const today = week.filter((e) => businessDateKey(new Date(e.started_at as string)) === todayKey);

    const CLOSED_STATUSES = new Set(['Cancelled', 'Complete', 'Draft', 'Closed']);
    const orders = (ordersRes.data ?? [])
      .map((o) => {
        const s = Array.isArray(o.order_statuses) ? o.order_statuses[0] : o.order_statuses;
        return {
          order_id: (o as { order_id: number }).order_id,
          status: ((s as { description?: string } | undefined)?.description) ?? 'Unknown',
        };
      })
      .filter((o) => !CLOSED_STATUSES.has(o.status));

    return NextResponse.json({
      data: {
        employee,
        isVa,
        openEntry: openRes.data ?? null,
        today,
        week,
        rate: rateRes.data?.hourly_rate ?? null,
        orders,
        projects: projectsRes.data ?? [],
        todayReport: todayReportRes.data ?? null,
      },
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'Not authenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (e instanceof Error && e.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    console.error('[GET /api/my-time/state]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
