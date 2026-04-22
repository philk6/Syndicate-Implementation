import { NextResponse } from 'next/server';
import {
  getSupabaseServerClient,
  requireAuthenticatedUser,
} from '@/lib/supplierIntel/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/supplier-intel/follow-up/queue
export async function GET() {
  try {
    await requireAuthenticatedUser();
    const supabase = await getSupabaseServerClient();

    const { data, error } = await supabase
      .from('si_follow_ups')
      .select('*, supplier:si_suppliers(id, company_name, website, outreach_status)')
      .order('next_follow_up_date', { ascending: true, nullsFirst: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
  } catch (e) {
    if (e instanceof Error && e.message === 'Not authenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[GET /api/supplier-intel/follow-up/queue]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
