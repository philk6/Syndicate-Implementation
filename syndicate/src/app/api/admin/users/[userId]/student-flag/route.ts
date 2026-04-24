import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assertRoleForRoute } from '@/lib/authz';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RouteCtx = { params: Promise<{ userId: string }> };

// PATCH /api/admin/users/[userId]/student-flag
// Body: { is_one_on_one_student: boolean }
// Side effects:
//   - Flips users.is_one_on_one_student
//   - If flipping ON and no team yet exists for this user, creates one
//     named "<First Last>'s Team" owned by them. Students can rename it
//     from the My Team portal.
//   - Flipping OFF does NOT delete the team — data is preserved in case
//     they're re-enabled. Admin can manage the orphaned team from /admin/teams.
export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  try {
    await assertRoleForRoute('admin');
    const { userId } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const desired = typeof body.is_one_on_one_student === 'boolean' ? body.is_one_on_one_student : null;
    if (desired === null) {
      return NextResponse.json({ error: 'is_one_on_one_student (boolean) required' }, { status: 400 });
    }

    const svc = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
    );

    const { data: target, error: fetchErr } = await svc
      .from('users')
      .select('user_id, firstname, lastname, email')
      .eq('user_id', userId)
      .maybeSingle();
    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { error: updateErr } = await svc
      .from('users')
      .update({ is_one_on_one_student: desired })
      .eq('user_id', userId);
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    let teamId: string | null = null;
    if (desired) {
      const { data: existingTeam } = await svc
        .from('teams')
        .select('id')
        .eq('owner_id', userId)
        .eq('is_warehouse', false)
        .maybeSingle();

      if (existingTeam) {
        teamId = existingTeam.id as string;
      } else {
        const first = (target.firstname ?? '').toString().trim();
        const last = (target.lastname ?? '').toString().trim();
        const displayName = `${first} ${last}`.trim() || (target.email ?? 'Student').split('@')[0];
        const { data: newTeam, error: teamErr } = await svc
          .from('teams')
          .insert({ name: `${displayName}'s Team`, owner_id: userId, is_warehouse: false })
          .select('id')
          .single();
        if (teamErr) return NextResponse.json({ error: `team create: ${teamErr.message}` }, { status: 500 });
        teamId = newTeam.id as string;
      }
    }

    return NextResponse.json({ data: { is_one_on_one_student: desired, team_id: teamId } });
  } catch (e) {
    if (e instanceof Error && e.message === 'Not authenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (e instanceof Error && e.message === 'Forbidden') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    console.error('[PATCH /api/admin/users/[userId]/student-flag]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
