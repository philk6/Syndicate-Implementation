// syndicate/src/app/api/credits/balance/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, getAuthUser } from '@/app/api/auth-utils';

// Force dynamic to prevent caching
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  console.log('API /credits/balance - Starting request');

  // 1. Authenticate the user using the service role utility
  const { user, error: authError } = await getAuthUser(request);

  if (authError || !user) {
    console.warn('API /credits/balance - Auth failed:', authError);
    return NextResponse.json({ error: `Authentication failed: ${authError}` }, { status: 401 });
  }

  console.log(`API /credits/balance - Authenticated user: ${user.id}`);

  try {
    // 2. Get the user's associated company_id from their profile
    const { data: userProfile, error: userError } = await supabaseAdmin
      .from('users')
      .select('company_id')
      .eq('user_id', user.id)
      .single();

    if (userError || !userProfile || !userProfile.company_id) {
      console.error('API /credits/balance - User profile error:', userError);
      return NextResponse.json({ error: 'User is not associated with a company.' }, { status: 404 });
    }

    console.log(`API /credits/balance - Found company_id: ${userProfile.company_id}`);

    // 3. Fetch the credit summary for that specific company
    const { data: summary, error: summaryError } = await supabaseAdmin
      .from('company_credit_summary')
      .select('total_balance, available_balance, held_balance, last_updated')
      .eq('company_id', userProfile.company_id)
      .single();

    // If no summary record exists, it's not an error. Return a zero balance.
    if (summaryError && summaryError.code === 'PGRST116') {
      console.warn(`API /credits/balance - No credit summary found for company ${userProfile.company_id}. Returning default.`);
      return NextResponse.json({
        total_balance: 0,
        available_balance: 0,
        held_balance: 0,
        last_updated: new Date().toISOString()
      }, { status: 200 });
    }
    
    if (summaryError) {
      console.error(`API /credits/balance - Error fetching balance for company ${userProfile.company_id}:`, summaryError);
      return NextResponse.json({ error: 'Could not retrieve credit balance.' }, { status: 500 });
    }

    console.log(`API /credits/balance - Successfully retrieved balance for company ${userProfile.company_id}`);
    return NextResponse.json(summary, { status: 200 });

  } catch(e: unknown) {
    console.error('API /credits/balance - Unexpected error:', e);
    return NextResponse.json({ error: 'An unexpected server error occurred.' }, { status: 500 });
  }
}