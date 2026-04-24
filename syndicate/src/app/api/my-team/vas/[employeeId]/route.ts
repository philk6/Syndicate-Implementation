import { NextRequest, NextResponse } from 'next/server';
import { resolveTeamContext } from '@/lib/myTeam';
import type { VaProfile } from '@/lib/permissions';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RouteCtx = { params: Promise<{ employeeId: string }> };
const ALLOWED_PROFILES: VaProfile[] = ['research', 'operations', 'customer_service', 'full_access'];

// PATCH /api/my-team/vas/[employeeId]?teamId=...
// Body supports: { active?, profile?, hourlyRate? }
// Validates the VA belongs to the resolved team before applying.
export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  try {
    const url = new URL(req.url);
    const teamId = url.searchParams.get('teamId') ?? undefined;
    const { user, svc, team } = await resolveTeamContext(teamId);
    const { employeeId } = await ctx.params;

    const { data: target, error: targetErr } = await svc
      .from('employees')
      .select('id, team_id')
      .eq('id', employeeId)
      .maybeSingle();
    if (targetErr) return NextResponse.json({ error: targetErr.message }, { status: 500 });
    if (!target) return NextResponse.json({ error: 'VA not found' }, { status: 404 });
    if (target.team_id !== team.id) return NextResponse.json({ error: 'VA does not belong to this team' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.active === 'boolean') patch.active = body.active;
    if (typeof body.profile === 'string') {
      if (!ALLOWED_PROFILES.includes(body.profile as VaProfile)) {
        return NextResponse.json({ error: 'Invalid profile' }, { status: 400 });
      }
      patch.va_profile = body.profile;
    }

    if (Object.keys(patch).length > 1) {
      const { error } = await svc.from('employees').update(patch).eq('id', employeeId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (body.hourlyRate !== undefined) {
      const rateNum = Number(body.hourlyRate);
      if (!Number.isFinite(rateNum) || rateNum < 0) {
        return NextResponse.json({ error: 'Hourly rate must be >= 0' }, { status: 400 });
      }
      const { error: rateErr } = await svc.from('employee_rates').insert({
        employee_id: employeeId,
        hourly_rate: rateNum,
        created_by: user.user_id,
      });
      if (rateErr) return NextResponse.json({ error: rateErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === 'Not authenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error('[PATCH /api/my-team/vas/[employeeId]]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
