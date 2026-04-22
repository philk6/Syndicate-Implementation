import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseServerClient,
  requireAuthenticatedUser,
} from '@/lib/supplierIntel/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RouteCtx = { params: Promise<{ listId: string }> };

// GET /api/supplier-intel/lists/[listId] — list + its suppliers (with latest analysis)
export async function GET(_req: NextRequest, ctx: RouteCtx) {
  try {
    await requireAuthenticatedUser();
    const supabase = await getSupabaseServerClient();
    const { listId } = await ctx.params;

    const { data: list, error: listErr } = await supabase
      .from('si_supplier_lists')
      .select('*')
      .eq('id', listId)
      .maybeSingle();
    if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });
    if (!list) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data: suppliers, error: supErr } = await supabase
      .from('si_suppliers')
      .select('*, analyses:si_supplier_analyses(*)')
      .eq('list_id', listId)
      .order('created_at', { ascending: false });
    if (supErr) return NextResponse.json({ error: supErr.message }, { status: 500 });

    return NextResponse.json({ data: { list, suppliers: suppliers ?? [] } });
  } catch (e) {
    if (e instanceof Error && e.message === 'Not authenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[GET /api/supplier-intel/lists/[listId]]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/supplier-intel/lists/[listId] — rename
export async function PUT(req: NextRequest, ctx: RouteCtx) {
  try {
    await requireAuthenticatedUser();
    const supabase = await getSupabaseServerClient();
    const { listId } = await ctx.params;

    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

    const { data, error } = await supabase
      .from('si_supplier_lists')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('id', listId)
      .select()
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ data });
  } catch (e) {
    if (e instanceof Error && e.message === 'Not authenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[PUT /api/supplier-intel/lists/[listId]]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/supplier-intel/lists/[listId]
export async function DELETE(_req: NextRequest, ctx: RouteCtx) {
  try {
    await requireAuthenticatedUser();
    const supabase = await getSupabaseServerClient();
    const { listId } = await ctx.params;

    const { error } = await supabase.from('si_supplier_lists').delete().eq('id', listId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === 'Not authenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[DELETE /api/supplier-intel/lists/[listId]]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
