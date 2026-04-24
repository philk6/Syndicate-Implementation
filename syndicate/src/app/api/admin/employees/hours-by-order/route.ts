import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assertRoleForRoute } from '@/lib/authz';
import { type TaskType, zonedWallClockToUtc } from '@/lib/timeTracking';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/admin/employees/hours-by-order?from=YYYY-MM-DD&to=YYYY-MM-DD
// Groups labor hours by order_id, with per-employee + per-task breakdown.
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

    const [entriesRes, empsRes] = await Promise.all([
      svc.from('time_entries').select('employee_id, started_at, ended_at, task, order_id')
        .not('order_id', 'is', null)
        .gte('started_at', startUtc.toISOString()).lt('started_at', endUtcExclusive.toISOString()),
      svc.from('employees').select('id, first_name, last_name'),
    ]);

    const empName = new Map<string, string>((empsRes.data ?? []).map((e) => [e.id as string, `${e.first_name} ${e.last_name}`]));

    interface EmpAgg { employee_id: string; name: string; total: number; byTask: Record<string, number>; }
    interface OrderAgg { order_id: number; total: number; perEmployee: Map<string, EmpAgg>; }
    const byOrder = new Map<number, OrderAgg>();

    for (const e of entriesRes.data ?? []) {
      if (!e.ended_at || !e.order_id) continue;
      const hours = Math.max(0, (new Date(e.ended_at as string).getTime() - new Date(e.started_at as string).getTime()) / 3600000);
      const orderId = e.order_id as number;
      if (!byOrder.has(orderId)) byOrder.set(orderId, { order_id: orderId, total: 0, perEmployee: new Map() });
      const agg = byOrder.get(orderId)!;
      agg.total += hours;
      const empKey = e.employee_id as string;
      if (!agg.perEmployee.has(empKey)) {
        agg.perEmployee.set(empKey, {
          employee_id: empKey,
          name: empName.get(empKey) ?? 'Unknown',
          total: 0,
          byTask: {},
        });
      }
      const empAgg = agg.perEmployee.get(empKey)!;
      empAgg.total += hours;
      empAgg.byTask[e.task as TaskType] = (empAgg.byTask[e.task as TaskType] ?? 0) + hours;
    }

    const rows = Array.from(byOrder.values())
      .map((o) => ({
        order_id: o.order_id,
        total_hours: o.total,
        per_employee: Array.from(o.perEmployee.values()).sort((a, b) => b.total - a.total),
      }))
      .sort((a, b) => b.total_hours - a.total_hours);

    return NextResponse.json({ data: { from: fromStr, to: toStr, rows } });
  } catch (e) {
    if (e instanceof Error && e.message === 'Not authenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    console.error('[GET /api/admin/employees/hours-by-order]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
