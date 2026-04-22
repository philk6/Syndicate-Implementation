import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseServerClient,
  requireAuthenticatedUser,
} from '@/lib/supplierIntel/server';
import { createSupplierList } from '@/lib/supplierIntel/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/supplier-intel/lists — all lists owned by current user (with supplier count)
export async function GET() {
  try {
    const { user } = await requireAuthenticatedUser();
    const supabase = await getSupabaseServerClient();

    // RLS already scopes to owned rows; select the supplier count via embedded resource
    const { data, error } = await supabase
      .from('si_supplier_lists')
      .select('*, suppliers:si_suppliers(count)')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('[GET /api/supplier-intel/lists]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (e) {
    if (e instanceof Error && e.message === 'Not authenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[GET /api/supplier-intel/lists]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/supplier-intel/lists — create a new list
export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAuthenticatedUser();
    const supabase = await getSupabaseServerClient();

    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      return NextResponse.json({ error: 'List name is required' }, { status: 400 });
    }

    const { data, error } = await createSupplierList(supabase, user.id, name);
    if (error) {
      console.error('[POST /api/supplier-intel/lists]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === 'Not authenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[POST /api/supplier-intel/lists]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
