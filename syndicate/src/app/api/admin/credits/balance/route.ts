export const dynamic = 'force-dynamic';
// syndicate/src/app/api/credits/balance/route.ts

import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

/**
 * API route for a logged-in user to fetch their own company's credit balance.
 */
export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });

  // 1. Authenticate the user's session.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized: No active session.' }, { status: 401 });
  }

  // 2. Get the user's associated company_id from their profile.
  const { data: userProfile, error: userError } = await supabase
    .from('users')
    .select('company_id')
    .eq('user_id', session.user.id)
    .single();

  if (userError || !userProfile || !userProfile.company_id) {
    return NextResponse.json({ error: 'User is not associated with a company.' }, { status: 404 });
  }

  // 3. Fetch the credit summary for that specific company.
  // RLS policies on the table also enforce this, preventing data leakage.
  const { data: summary, error: summaryError } = await supabase
    .from('company_credit_summary')
    .select('total_balance, available_balance, held_balance, last_updated')
    .eq('company_id', userProfile.company_id)
    .single();

  if (summaryError) {
    console.error(`Error fetching balance for company ${userProfile.company_id}:`, summaryError);
    // This could happen if a summary record was missed during initialization.
    if (summaryError.code === 'PGRST116') { // 'PGRST116' is the code for "exact one row not found"
        return NextResponse.json({ error: 'Credit balance not initialized for this company.' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Could not retrieve credit balance.' }, { status: 500 });
  }

  return NextResponse.json(summary, { status: 200 });
}
