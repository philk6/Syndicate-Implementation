import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseServerClient,
  requireAuthenticatedUser,
} from '@/lib/supplierIntel/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RouteCtx = { params: Promise<{ searchId: string }> };

// GET /api/supplier-intel/discovery/[searchId]
export async function GET(_req: NextRequest, ctx: RouteCtx) {
  try {
    await requireAuthenticatedUser();
    const supabase = await getSupabaseServerClient();
    const { searchId } = await ctx.params;

    const { data, error } = await supabase
      .from('si_discovery_searches')
      .select('*, candidates:si_discovery_candidates(*)')
      .eq('id', searchId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ data });
  } catch (e) {
    if (e instanceof Error && e.message === 'Not authenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[GET /api/supplier-intel/discovery/[searchId]]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/supplier-intel/discovery/[searchId]
export async function DELETE(_req: NextRequest, ctx: RouteCtx) {
  try {
    await requireAuthenticatedUser();
    const supabase = await getSupabaseServerClient();
    const { searchId } = await ctx.params;

    const { error } = await supabase.from('si_discovery_searches').delete().eq('id', searchId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === 'Not authenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[DELETE /api/supplier-intel/discovery/[searchId]]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
