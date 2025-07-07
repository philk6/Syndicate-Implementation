// /src/app/api/admin/credits/summary/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, getAuthUser, requireAdmin } from '@/app/api/auth-utils';

// Force dynamic to prevent caching
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  console.log('API /admin/credits/summary - Starting with service role auth');

  // 1. Authenticate the user using the auth utility
  const { user, error: authError } = await getAuthUser(request);

  if (authError || !user) {
    console.warn('API /admin/credits/summary - Auth failed:', authError);
    return NextResponse.json({ error: `Authentication failed: ${authError}` }, { status: 401 });
  }

  // 2. Verify the user is an admin
  if (!requireAdmin(user)) {
    console.warn(`API /admin/credits/summary - Forbidden access for user ${user.id} with role ${user.role}`);
    return NextResponse.json({ error: 'Forbidden: Administrator privileges required.' }, { status: 403 });
  }

  console.log(`API /admin/credits/summary - Admin access granted for ${user.email}`);

  try {
    // 3. Fetch data using the supabaseAdmin client (service role)
    const { data: summaries, error: summaryError } = await supabaseAdmin
      .from('company_credit_summary')
      .select(`
        company_id,
        total_balance,
        available_balance,
        held_balance,
        last_updated,
        company:company_id ( name )
      `)
      .order('total_balance', { ascending: false });

    if (summaryError) {
      console.error('API /admin/credits/summary - Error fetching credit summaries:', summaryError);
      return NextResponse.json({ error: `Database error: ${summaryError.message}` }, { status: 500 });
    }

    // 4. Calculate totals (same logic as before)
    const totals = (summaries || []).reduce((acc, summary) => ({
      totalCredits: acc.totalCredits + (summary.total_balance || 0),
      totalHeld: acc.totalHeld + (summary.held_balance || 0),
      totalAvailable: acc.totalAvailable + (summary.available_balance || 0),
      activeCompanies: summary.total_balance > 0 ? acc.activeCompanies + 1 : acc.activeCompanies
    }), {
      totalCredits: 0,
      totalHeld: 0,
      totalAvailable: 0,
      activeCompanies: 0
    });

    return NextResponse.json({
      summaries: summaries || [],
      totals
    });

  } catch (e: unknown) {
    console.error('API /admin/credits/summary - Unexpected error:', e);
    return NextResponse.json({ error: 'An unexpected server error occurred.', details: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}
