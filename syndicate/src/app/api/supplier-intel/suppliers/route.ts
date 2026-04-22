import { NextRequest, NextResponse } from 'next/server';
import { createId } from '@paralleldrive/cuid2';
import {
  getSupabaseServerClient,
  requireAuthenticatedUser,
} from '@/lib/supplierIntel/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/supplier-intel/suppliers
// Body: { listId: string; companyName: string; website?: string; notes?: string }
export async function POST(req: NextRequest) {
  try {
    await requireAuthenticatedUser();
    const supabase = await getSupabaseServerClient();

    const body = await req.json().catch(() => ({}));
    const listId = typeof body.listId === 'string' ? body.listId : '';
    const companyName = typeof body.companyName === 'string' ? body.companyName.trim() : '';
    const website = typeof body.website === 'string' && body.website.trim() ? body.website.trim() : null;
    const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null;

    if (!listId) return NextResponse.json({ error: 'listId is required' }, { status: 400 });
    if (!companyName) return NextResponse.json({ error: 'companyName is required' }, { status: 400 });

    const id = createId();
    const { data, error } = await supabase
      .from('si_suppliers')
      .insert({ id, list_id: listId, company_name: companyName, website, notes })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === 'Not authenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[POST /api/supplier-intel/suppliers]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
