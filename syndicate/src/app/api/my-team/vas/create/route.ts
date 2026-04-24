import { NextRequest, NextResponse } from 'next/server';
import { resolveTeamContext } from '@/lib/myTeam';
import type { VaProfile } from '@/lib/permissions';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ALLOWED_PROFILES: VaProfile[] = ['research', 'operations', 'customer_service', 'full_access'];

// POST /api/my-team/vas/create?teamId=...
// Body: { firstName, lastName, email, profile, hourlyRate, startDate, tempPassword }
// Creates a VA scoped to the resolved team. Admin or team-owner only.
export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const teamId = url.searchParams.get('teamId') ?? undefined;
    const { user, svc, team } = await resolveTeamContext(teamId);

    const body = await req.json().catch(() => ({}));
    const firstName = (body.firstName ?? '').toString().trim();
    const lastName = (body.lastName ?? '').toString().trim();
    const email = (body.email ?? '').toString().trim().toLowerCase();
    const startDate = (body.startDate ?? '').toString().trim();
    const tempPassword = (body.tempPassword ?? '').toString();
    const profile = body.profile as VaProfile;
    const hourlyRate = Number(body.hourlyRate);

    if (!firstName || !lastName) return NextResponse.json({ error: 'First and last name required' }, { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
    if (!ALLOWED_PROFILES.includes(profile)) return NextResponse.json({ error: 'Invalid profile' }, { status: 400 });
    if (!Number.isFinite(hourlyRate) || hourlyRate < 0) return NextResponse.json({ error: 'Hourly rate must be >= 0' }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return NextResponse.json({ error: 'Start date YYYY-MM-DD' }, { status: 400 });
    if (tempPassword.length < 8) return NextResponse.json({ error: 'Password must be at least 8 chars' }, { status: 400 });

    // 1. Auth user.
    const { data: authUser, error: authErr } = await svc.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName, role: 'va', team_id: team.id },
    });
    if (authErr || !authUser?.user?.id) {
      console.error('[my-team/vas/create] auth.admin.createUser', authErr);
      return NextResponse.json({ error: authErr?.message ?? 'Failed to create auth user' }, { status: 500 });
    }
    const userId = authUser.user.id;
    const rollback = async () => { await svc.auth.admin.deleteUser(userId).catch(() => undefined); };

    // 2. public.users row.
    const { error: userErr } = await svc.from('users').insert({
      user_id: userId,
      email,
      firstname: firstName,
      lastname: lastName,
      role: 'va',
      is_one_on_one_student: false,
    });
    if (userErr) {
      await rollback();
      return NextResponse.json({ error: `users insert: ${userErr.message}` }, { status: 500 });
    }

    // 3. public.employees row (with team scope + va_profile).
    const { data: empRow, error: empErr } = await svc
      .from('employees')
      .insert({
        user_id: userId,
        first_name: firstName,
        last_name: lastName,
        employment_start_date: startDate,
        team_id: team.id,
        va_profile: profile,
      })
      .select('id')
      .single();
    if (empErr || !empRow) {
      await svc.from('users').delete().eq('user_id', userId);
      await rollback();
      return NextResponse.json({ error: `employees insert: ${empErr?.message}` }, { status: 500 });
    }

    // 4. Initial rate — created_by = acting user (team owner or admin).
    const { error: rateErr } = await svc.from('employee_rates').insert({
      employee_id: empRow.id,
      hourly_rate: hourlyRate,
      created_by: user.user_id,
    });
    if (rateErr) {
      await svc.from('employees').delete().eq('id', empRow.id);
      await svc.from('users').delete().eq('user_id', userId);
      await rollback();
      return NextResponse.json({ error: `rate insert: ${rateErr.message}` }, { status: 500 });
    }

    return NextResponse.json({
      data: { employeeId: empRow.id, userId, email, tempPassword, profile, teamId: team.id },
    }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === 'Not authenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (e instanceof Error && e.message === 'Team not found') return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    if (e instanceof Error && e.message === 'No team found for current user') {
      return NextResponse.json({ error: 'No team found for this user' }, { status: 404 });
    }
    console.error('[POST /api/my-team/vas/create]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
