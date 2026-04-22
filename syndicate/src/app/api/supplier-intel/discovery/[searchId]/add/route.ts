import { NextRequest, NextResponse } from 'next/server';
import { createId } from '@paralleldrive/cuid2';
import {
  getSupabaseServerClient,
  requireAuthenticatedUser,
} from '@/lib/supplierIntel/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RouteCtx = { params: Promise<{ searchId: string }> };

// POST /api/supplier-intel/discovery/[searchId]/add
// Body: { candidateId: string; listId: string }
// Moves a discovery candidate into a supplier list.
export async function POST(req: NextRequest, ctx: RouteCtx) {
  try {
    await requireAuthenticatedUser();
    const supabase = await getSupabaseServerClient();
    const { searchId } = await ctx.params;

    const body = await req.json().catch(() => ({}));
    const candidateId: string = body.candidateId ?? '';
    const listId: string = body.listId ?? '';
    if (!candidateId || !listId) {
      return NextResponse.json({ error: 'candidateId and listId are required' }, { status: 400 });
    }

    const { data: candidate, error: candErr } = await supabase
      .from('si_discovery_candidates')
      .select('*')
      .eq('id', candidateId)
      .eq('search_id', searchId)
      .maybeSingle();
    if (candErr) return NextResponse.json({ error: candErr.message }, { status: 500 });
    if (!candidate) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });

    const supplierId = createId();
    const { data: supplier, error: insErr } = await supabase
      .from('si_suppliers')
      .insert({
        id: supplierId,
        list_id: listId,
        company_name: candidate.company_name,
        website: candidate.website,
        notes: candidate.authorization_reasoning
          ? `From discovery: ${candidate.authorization_reasoning}`
          : null,
      })
      .select()
      .single();
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

    await supabase
      .from('si_discovery_candidates')
      .update({ supplier_id: supplierId, added_to_list_at: new Date().toISOString() })
      .eq('id', candidateId);

    return NextResponse.json({ data: supplier }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === 'Not authenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[POST /api/supplier-intel/discovery/[searchId]/add]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
