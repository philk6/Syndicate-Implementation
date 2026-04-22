import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseServerClient,
  requireAuthenticatedUser,
} from '@/lib/supplierIntel/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RouteCtx = { params: Promise<{ supplierId: string }> };

// GET /api/supplier-intel/suppliers/[supplierId] — supplier + analyses + outreach
export async function GET(_req: NextRequest, ctx: RouteCtx) {
  try {
    await requireAuthenticatedUser();
    const supabase = await getSupabaseServerClient();
    const { supplierId } = await ctx.params;

    const { data, error } = await supabase
      .from('si_suppliers')
      .select(
        '*, analyses:si_supplier_analyses(*), outreach_events:si_outreach_events(*), list:si_supplier_lists(id,name)',
      )
      .eq('id', supplierId)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ data });
  } catch (e) {
    if (e instanceof Error && e.message === 'Not authenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[GET /api/supplier-intel/suppliers/[supplierId]]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/supplier-intel/suppliers/[supplierId] — update workflow_status / outreach_status / notes
export async function PUT(req: NextRequest, ctx: RouteCtx) {
  try {
    await requireAuthenticatedUser();
    const supabase = await getSupabaseServerClient();
    const { supplierId } = await ctx.params;

    const body = await req.json().catch(() => ({}));
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.workflow_status === 'string') patch.workflow_status = body.workflow_status;
    if (typeof body.outreach_status === 'string') patch.outreach_status = body.outreach_status;
    if (typeof body.notes === 'string') patch.notes = body.notes;
    if (typeof body.company_name === 'string' && body.company_name.trim()) {
      patch.company_name = body.company_name.trim();
    }
    if (typeof body.website === 'string') patch.website = body.website.trim() || null;
    if (typeof body.rejection_reason === 'string') patch.rejection_reason = body.rejection_reason;

    const { data, error } = await supabase
      .from('si_suppliers')
      .update(patch)
      .eq('id', supplierId)
      .select()
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ data });
  } catch (e) {
    if (e instanceof Error && e.message === 'Not authenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[PUT /api/supplier-intel/suppliers/[supplierId]]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/supplier-intel/suppliers/[supplierId]
export async function DELETE(_req: NextRequest, ctx: RouteCtx) {
  try {
    await requireAuthenticatedUser();
    const supabase = await getSupabaseServerClient();
    const { supplierId } = await ctx.params;

    const { error } = await supabase.from('si_suppliers').delete().eq('id', supplierId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === 'Not authenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[DELETE /api/supplier-intel/suppliers/[supplierId]]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
