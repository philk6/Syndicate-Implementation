import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assertRoleForRoute } from '@/lib/authz';
import { payPeriodRange, businessDateKey } from '@/lib/timeTracking';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/my-time/state
// Returns everything the /my-time page needs in one round-trip:
//   - my employee record (or null → user isn't an employee)
//   - currently-open entry (or null)
//   - today's entries (Chicago business date)
//   - this week's entries (current pay period)
//   - current hourly rate
//   - active orders for the task-tag dropdown
export async function GET() {
  try {
    const me = await assertRoleForRoute('admin-or-employee');

    const service = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
    );

    const { data: employee } = await service
      .from('employees')
      .select('id, first_name, last_name, active, employment_start_date')
      .eq('user_id', me.user_id)
      .maybeSingle();

    // Admins without an employee row get a valid empty state (they may still
    // want to view the page; the UI shows an explanatory message).
    if (!employee) {
      return NextResponse.json({
        data: { employee: null, openEntry: null, today: [], week: [], rate: null, orders: [] },
      });
    }

    const [rangeStart, rangeEnd] = payPeriodRange(new Date());

    const [openRes, weekRes, rateRes, ordersRes] = await Promise.all([
      service
        .from('time_entries')
        .select('id, started_at, ended_at, task, order_id, note')
        .eq('employee_id', employee.id)
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      service
        .from('time_entries')
        .select('id, started_at, ended_at, task, order_id, note')
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
      service
        .from('orders')
        .select('order_id, order_status_id, order_statuses(description)')
        .order('order_id', { ascending: false })
        .limit(200),
    ]);

    // "Today" = Chicago business date for now. We group client-side by
    // businessDateKey anyway, but the server's filter here is cheap.
    const todayKey = businessDateKey(new Date());
    const week = weekRes.data ?? [];
    const today = week.filter((e) => businessDateKey(new Date(e.started_at as string)) === todayKey);

    // Filter orders to "active-ish": exclude cancelled / closed etc. The
    // order_statuses.description filter is soft — when the join returns a
    // description, we keep orders whose status isn't obviously terminal.
    const CLOSED_STATUSES = new Set(['Cancelled', 'Complete', 'Draft', 'Closed']);
    const orders = (ordersRes.data ?? [])
      .map((o) => {
        const s = Array.isArray(o.order_statuses) ? o.order_statuses[0] : o.order_statuses;
        return {
          order_id: o.order_id as number,
          status: (s?.description as string | undefined) ?? 'Unknown',
        };
      })
      .filter((o) => !CLOSED_STATUSES.has(o.status));

    return NextResponse.json({
      data: {
        employee,
        openEntry: openRes.data ?? null,
        today,
        week,
        rate: rateRes.data?.hourly_rate ?? null,
        orders,
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
