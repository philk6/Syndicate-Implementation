import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assertRoleForRoute } from '@/lib/authz';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/my-time/clock-out
// Closes the user's currently-open time_entry.
export async function POST() {
  try {
    const me = await assertRoleForRoute('admin-or-employee');

    const service = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
    );

    const { data: employee } = await service
      .from('employees')
      .select('id')
      .eq('user_id', me.user_id)
      .maybeSingle();
    if (!employee) {
      return NextResponse.json({ error: 'No employee record for this user' }, { status: 404 });
    }

    const { data: open } = await service
      .from('time_entries')
      .select('id')
      .eq('employee_id', employee.id)
      .is('ended_at', null)
      .limit(1)
      .maybeSingle();
    if (!open) {
      return NextResponse.json({ error: 'Not currently clocked in' }, { status: 409 });
    }

    const { data, error } = await service
      .from('time_entries')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', open.id)
      .select('id, started_at, ended_at, task, order_id, note')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data });
  } catch (e) {
    if (e instanceof Error && e.message === 'Not authenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (e instanceof Error && e.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    console.error('[POST /api/my-time/clock-out]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
