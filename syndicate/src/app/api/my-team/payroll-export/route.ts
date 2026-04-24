import { NextRequest, NextResponse } from 'next/server';
import { resolveTeamContext } from '@/lib/myTeam';
import { type TaskType, zonedWallClockToUtc } from '@/lib/timeTracking';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/my-team/payroll-export?teamId=&from=&to=
// Team-scoped CSV export, same columns as the admin payroll route.
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
      svc.from('employees').select('id, user_id, first_name, last_name, active').eq('team_id', team.id),
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

    interface Bucket {
      total: number; prep: number; shipping: number; labeling: number;
      receiving: number; cleaning: number; break_: number; other: number; unresolved: boolean;
    }
    const mk = (): Bucket => ({
      total: 0, prep: 0, shipping: 0, labeling: 0, receiving: 0,
      cleaning: 0, break_: 0, other: 0, unresolved: false,
    });
    const byEmp = new Map<string, Bucket>();
    for (const e of entries ?? []) {
      const k = e.employee_id as string;
      if (!byEmp.has(k)) byEmp.set(k, mk());
      const b = byEmp.get(k)!;
      if (!e.ended_at) { b.unresolved = true; continue; }
      const hrs = Math.max(0, (new Date(e.ended_at as string).getTime() - new Date(e.started_at as string).getTime()) / 3600000);
      const task = e.task as TaskType;
      b.total += hrs;
      if (task === 'prep') b.prep += hrs;
      else if (task === 'shipping') b.shipping += hrs;
      else if (task === 'labeling') b.labeling += hrs;
      else if (task === 'receiving_order' || task === 'receiving_general') b.receiving += hrs;
      else if (task === 'cleaning') b.cleaning += hrs;
      else if (task === 'break') b.break_ += hrs;
      else b.other += hrs;
    }

    const header = [
      'Employee Name', 'Email', 'Pay Period Start', 'Pay Period End',
      'Total Hours', 'Prep Hours', 'Shipping Hours', 'Labeling Hours',
      'Receiving Hours', 'Cleaning Hours', 'Break Hours', 'Other Hours',
      'Hourly Rate', 'Gross Pay', 'Has Unresolved Entries',
    ];
    const esc = (v: string | number | boolean): string => {
      const s = typeof v === 'number' ? v.toString() : typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const lines = [header.map(esc).join(',')];
    for (const emp of empsRes.data ?? []) {
      if (!emp.active) continue;
      const b = byEmp.get(emp.id as string) ?? mk();
      const rate = rateByEmployee.get(emp.id as string) ?? 0;
      const gross = b.total * rate;
      lines.push([
        `${emp.first_name} ${emp.last_name}`,
        emailByUser.get(emp.user_id as string) ?? '',
        fromStr, toStr,
        b.total.toFixed(2), b.prep.toFixed(2), b.shipping.toFixed(2), b.labeling.toFixed(2),
        b.receiving.toFixed(2), b.cleaning.toFixed(2), b.break_.toFixed(2), b.other.toFixed(2),
        rate.toFixed(2), gross.toFixed(2), b.unresolved,
      ].map(esc).join(','));
    }

    const csv = lines.join('\n') + '\n';
    const safeTeam = team.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'team';
    const filename = `payroll_${safeTeam}_${fromStr}_to_${toStr}.csv`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'Not authenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error('[GET /api/my-team/payroll-export]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
