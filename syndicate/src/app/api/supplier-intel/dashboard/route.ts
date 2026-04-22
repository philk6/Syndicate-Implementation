import { NextResponse } from 'next/server';
import {
  getSupabaseServerClient,
  requireAuthenticatedUser,
} from '@/lib/supplierIntel/server';
import { getDashboardStats } from '@/lib/supplierIntel/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/supplier-intel/dashboard — aggregated stats for the logged-in user
export async function GET() {
  try {
    const { user } = await requireAuthenticatedUser();
    const supabase = await getSupabaseServerClient();

    const stats = await getDashboardStats(supabase, user.id);
    return NextResponse.json({ data: stats });
  } catch (e) {
    if (e instanceof Error && e.message === 'Not authenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[GET /api/supplier-intel/dashboard]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
