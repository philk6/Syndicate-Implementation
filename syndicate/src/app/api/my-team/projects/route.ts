import { NextRequest, NextResponse } from 'next/server';
import { resolveTeamContext } from '@/lib/myTeam';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/my-team/projects?teamId=...
// Body: { name, description? }
export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const teamId = url.searchParams.get('teamId') ?? undefined;
    const { user, svc, team } = await resolveTeamContext(teamId);

    const body = await req.json().catch(() => ({}));
    const name = (body.name ?? '').toString().trim();
    const description: string | null = typeof body.description === 'string' && body.description.trim()
      ? body.description.trim()
      : null;
    if (!name) return NextResponse.json({ error: 'Project name required' }, { status: 400 });

    const { data, error } = await svc
      .from('team_projects')
      .insert({ team_id: team.id, name, description, created_by: user.user_id })
      .select('id, name, description, active, created_at, archived_at')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === 'Not authenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error('[POST /api/my-team/projects]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
