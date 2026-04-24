import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assertRoleForRoute } from '@/lib/authz';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RouteCtx = { params: Promise<{ employeeId: string }> };

// PATCH /api/admin/employees/[employeeId]
// Body supports: { active?: boolean; hourlyRate?: number }
// - Toggles active (deactivate/reactivate).
// - Inserts a new employee_rates row when hourlyRate is present.
// edited_by / created_by record the admin.
export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  try {
    const admin = await assertRoleForRoute('admin');
    const { employeeId } = await ctx.params;
    const body = await req.json().catch(() => ({}));

    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
    );

    const patch: Record<string, unknown> = {};
    if (typeof body.active === 'boolean') {
      patch.active = body.active;
      patch.updated_at = new Date().toISOString();
    }

    if (Object.keys(patch).length) {
      const { error } = await serviceClient.from('employees').update(patch).eq('id', employeeId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (body.hourlyRate !== undefined) {
      const rateNum = Number(body.hourlyRate);
      if (!Number.isFinite(rateNum) || rateNum < 0) {
        return NextResponse.json({ error: 'Hourly rate must be a non-negative number' }, { status: 400 });
      }
      const { error: rateErr } = await serviceClient.from('employee_rates').insert({
        employee_id: employeeId,
        hourly_rate: rateNum,
        created_by: admin.user_id,
      });
      if (rateErr) return NextResponse.json({ error: rateErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === 'Not authenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (e instanceof Error && e.message === 'Forbidden') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    console.error('[PATCH /api/admin/employees/[employeeId]]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
