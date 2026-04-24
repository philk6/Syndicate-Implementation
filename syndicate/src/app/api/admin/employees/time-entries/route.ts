import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assertRoleForRoute } from '@/lib/authz';
import { zonedWallClockToUtc } from '@/lib/timeTracking';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/admin/employees/time-entries?employeeId=...&from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(req: NextRequest) {
  try {
    await assertRoleForRoute('admin');
    const url = new URL(req.url);
    const employeeId = url.searchParams.get('employeeId') ?? '';
    const fromStr = url.searchParams.get('from') ?? '';
    const toStr = url.searchParams.get('to') ?? '';
    if (!employeeId) return NextResponse.json({ error: 'employeeId required' }, { status: 400 });
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

    const { data, error } = await svc
      .from('time_entries')
      .select('id, started_at, ended_at, task, order_id, note, edited_by, edited_at')
      .eq('employee_id', employeeId)
      .gte('started_at', startUtc.toISOString())
      .lt('started_at', endUtcExclusive.toISOString())
      .order('started_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
  } catch (e) {
    if (e instanceof Error && e.message === 'Not authenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    console.error('[GET /api/admin/employees/time-entries]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
