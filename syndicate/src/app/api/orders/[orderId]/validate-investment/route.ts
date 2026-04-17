export const dynamic = 'force-dynamic';
// syndicate/src/app/api/orders/[orderId]/validate-investment/route.ts

import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

/**
 * API route for a user to validate if a potential investment amount
 * is within their company's available credit limit.
 */
export async function POST(
  request: Request
) {
  const { investmentAmount } = await request.json();
  const supabase = createRouteHandlerClient({ cookies });

  // 1. Authenticate the user's session.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized: No active session.' }, { status: 401 });
  }
  
  // 2. Get the user's company_id.
  const { data: userProfile, error: userError } = await supabase
    .from('users')
    .select('company_id')
    .eq('user_id', session.user.id)
    .single();

  if (userError || !userProfile || !userProfile.company_id) {
    return NextResponse.json({ error: 'User is not associated with a company.' }, { status: 404 });
  }

  // 3. Call the `get_available_balance` function for a consistent source of truth.
  const { data: balance, error: rpcError } = await supabase.rpc('get_available_balance', {
    p_company_id: userProfile.company_id,
  });

  if (rpcError) {
    console.error('RPC Error getting available balance:', rpcError);
    return NextResponse.json({ error: 'Could not retrieve balance' }, { status: 500 });
  }
  
  // 4. Perform the validation check.
  const isSufficient = balance >= investmentAmount;

  return NextResponse.json({
    isSufficient,
    availableBalance: balance,
    requestedAmount: investmentAmount,
  }, { status: 200 });
}
