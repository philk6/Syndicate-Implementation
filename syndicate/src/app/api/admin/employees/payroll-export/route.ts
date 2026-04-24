import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assertRoleForRoute } from '@/lib/authz';
import { type TaskType, zonedWallClockToUtc } from '@/lib/timeTracking';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/admin/employees/payroll-export?from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns a text/csv response with payroll columns. Unresolved open entries
// (ended_at IS NULL) are SKIPPED from totals and the row gets a "has
// unresolved entries" flag so the admin knows to go fix them.
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

    const [empsRes, usersRes, entriesRes, ratesRes] = await Promise.all([
      svc.from('employees').select('id, user_id, first_name, last_name, active'),
      svc.from('users').select('user_id, email'),
      svc.from('time_entries').select('employee_id, started_at, ended_at, task')
        .gte('started_at', startUtc.toISOString()).lt('started_at', endUtcExclusive.toISOString()),
      svc.from('employee_rates').select('employee_id, hourly_rate, effective_from'),
    ]);

    const emailByUser = new Map<string, string>((usersRes.data ?? []).map((u) => [u.user_id as string, u.email as string]));

    // Rate effective for the period = most recent rate with effective_from <= period start.
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
      total: number;
      prep: number;
      shipping: number;
      labeling: number;
      receiving: number; // combines receiving_order + receiving_general
      cleaning: number;
      break_: number;
      other: number;
      unresolved: boolean;
    }
    const mkBucket = (): Bucket => ({
      total: 0, prep: 0, shipping: 0, labeling: 0, receiving: 0,
      cleaning: 0, break_: 0, other: 0, unresolved: false,
    });

    const byEmp = new Map<string, Bucket>();
    for (const e of entriesRes.data ?? []) {
      const key = e.employee_id as string;
      if (!byEmp.has(key)) byEmp.set(key, mkBucket());
      const b = byEmp.get(key)!;
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

    // CSV field quoting: quote any field with comma / quote / newline.
    const esc = (v: string | number | boolean): string => {
      const s = typeof v === 'number' ? v.toString() : typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const lines: string[] = [header.map(esc).join(',')];
    for (const emp of empsRes.data ?? []) {
      if (!emp.active) continue; // payroll runs for active employees; deactivated keep history but don't pay.
      const b = byEmp.get(emp.id as string) ?? mkBucket();
      const rate = rateByEmployee.get(emp.id as string) ?? 0;
      const gross = b.total * rate;
      const row = [
        `${emp.first_name} ${emp.last_name}`,
        emailByUser.get(emp.user_id as string) ?? '',
        fromStr,
        toStr,
        b.total.toFixed(2),
        b.prep.toFixed(2),
        b.shipping.toFixed(2),
        b.labeling.toFixed(2),
        b.receiving.toFixed(2),
        b.cleaning.toFixed(2),
        b.break_.toFixed(2),
        b.other.toFixed(2),
        rate.toFixed(2),
        gross.toFixed(2),
        b.unresolved,
      ];
      lines.push(row.map(esc).join(','));
    }

    const csv = lines.join('\n') + '\n';
    const filename = `payroll_${fromStr}_to_${toStr}.csv`;
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
    if (e instanceof Error && e.message === 'Forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    console.error('[GET /api/admin/employees/payroll-export]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
