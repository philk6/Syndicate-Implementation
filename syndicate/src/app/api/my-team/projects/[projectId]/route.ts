import { NextRequest, NextResponse } from 'next/server';
import { resolveTeamContext } from '@/lib/myTeam';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RouteCtx = { params: Promise<{ projectId: string }> };

// PATCH /api/my-team/projects/[projectId]?teamId=...
// Body: { active?: boolean; name?: string; description?: string | null }
export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  try {
    const url = new URL(req.url);
    const teamId = url.searchParams.get('teamId') ?? undefined;
    const { svc, team } = await resolveTeamContext(teamId);
    const { projectId } = await ctx.params;

    const { data: target } = await svc
      .from('team_projects')
      .select('id, team_id')
      .eq('id', projectId)
      .maybeSingle();
    if (!target) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    if (target.team_id !== team.id) return NextResponse.json({ error: 'Project does not belong to this team' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const patch: Record<string, unknown> = {};
    if (typeof body.active === 'boolean') {
      patch.active = body.active;
      patch.archived_at = body.active ? null : new Date().toISOString();
    }
    if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim();
    if (body.description === null) patch.description = null;
    else if (typeof body.description === 'string') patch.description = body.description;

    if (!Object.keys(patch).length) return NextResponse.json({ ok: true });

    const { error } = await svc.from('team_projects').update(patch).eq('id', projectId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === 'Not authenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error('[PATCH /api/my-team/projects/[projectId]]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
