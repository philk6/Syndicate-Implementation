import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assertRoleForRoute } from '@/lib/authz';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface CreatePayload {
  firstName?: string;
  lastName?: string;
  email?: string;
  hourlyRate?: number | string;
  startDate?: string; // YYYY-MM-DD
  tempPassword?: string;
}

// POST /api/admin/employees/create
// Creates: auth user (confirmed, no email), public.users row, public.employees
// row, public.employee_rates initial row. Returns { email, tempPassword } once
// so the admin can verbally relay credentials. Temp password is never
// persisted anywhere readable (only Supabase auth's hashed copy).
export async function POST(req: NextRequest) {
  try {
    const admin = await assertRoleForRoute('admin');

    const body = (await req.json().catch(() => ({}))) as CreatePayload;
    const firstName = (body.firstName ?? '').toString().trim();
    const lastName = (body.lastName ?? '').toString().trim();
    const email = (body.email ?? '').toString().trim().toLowerCase();
    const startDate = (body.startDate ?? '').toString().trim();
    const tempPassword = (body.tempPassword ?? '').toString();
    const hourlyRateNum = Number(body.hourlyRate);

    if (!firstName || !lastName) {
      return NextResponse.json({ error: 'First and last name required' }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
    }
    if (!Number.isFinite(hourlyRateNum) || hourlyRateNum < 0) {
      return NextResponse.json({ error: 'Hourly rate must be a non-negative number' }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      return NextResponse.json({ error: 'Start date must be YYYY-MM-DD' }, { status: 400 });
    }
    if (tempPassword.length < 8) {
      return NextResponse.json({ error: 'Temp password must be at least 8 characters' }, { status: 400 });
    }

    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
    );

    // 1. Create auth user (email confirmed — we're not sending verification email).
    const { data: authUser, error: authErr } = await serviceClient.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName, role: 'employee' },
    });
    if (authErr || !authUser?.user?.id) {
      console.error('[admin/employees/create] auth.admin.createUser error', authErr);
      return NextResponse.json(
        { error: authErr?.message ?? 'Failed to create auth user' },
        { status: 500 },
      );
    }
    const userId = authUser.user.id;

    // From here, rollback manually on failure — Supabase REST doesn't give us
    // a real txn across these tables.
    const rollback = async () => {
      await serviceClient.auth.admin.deleteUser(userId).catch(() => undefined);
    };

    // 2. public.users row.
    const { error: userErr } = await serviceClient.from('users').insert({
      user_id: userId,
      email,
      firstname: firstName,
      lastname: lastName,
      role: 'employee',
    });
    if (userErr) {
      await rollback();
      console.error('[admin/employees/create] users insert failed', userErr);
      return NextResponse.json({ error: `users insert: ${userErr.message}` }, { status: 500 });
    }

    // 3. public.employees row.
    const { data: empRow, error: empErr } = await serviceClient
      .from('employees')
      .insert({
        user_id: userId,
        first_name: firstName,
        last_name: lastName,
        employment_start_date: startDate,
      })
      .select('id')
      .single();
    if (empErr || !empRow) {
      await serviceClient.from('users').delete().eq('user_id', userId);
      await rollback();
      console.error('[admin/employees/create] employees insert failed', empErr);
      return NextResponse.json({ error: `employees insert: ${empErr?.message}` }, { status: 500 });
    }

    // 4. Initial rate.
    const { error: rateErr } = await serviceClient.from('employee_rates').insert({
      employee_id: empRow.id,
      hourly_rate: hourlyRateNum,
      created_by: admin.user_id,
    });
    if (rateErr) {
      await serviceClient.from('employees').delete().eq('id', empRow.id);
      await serviceClient.from('users').delete().eq('user_id', userId);
      await rollback();
      console.error('[admin/employees/create] employee_rates insert failed', rateErr);
      return NextResponse.json({ error: `rate insert: ${rateErr.message}` }, { status: 500 });
    }

    return NextResponse.json({
      data: {
        employeeId: empRow.id,
        userId,
        email,
        tempPassword, // Returned ONCE — caller must display and discard.
      },
    }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === 'Not authenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (e instanceof Error && e.message === 'Forbidden') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    console.error('[POST /api/admin/employees/create]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
