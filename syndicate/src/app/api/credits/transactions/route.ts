// /src/app/api/credits/transactions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, getAuthUser } from '@/app/api/auth-utils';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // 1. Authenticate the user
  const { user, error: authError } = await getAuthUser(request);

  if (authError || !user) {
    return NextResponse.json({ error: `Authentication failed: ${authError}` }, { status: 401 });
  }

  try {
    // 2. Get the user's company_id from the users table
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('company_id')
      .eq('user_id', user.id)
      .single();

    if (userError || !userData) {
      console.error('Error fetching user data:', userError);
      return NextResponse.json({ error: 'Failed to fetch user information.' }, { status: 500 });
    }

    if (!userData.company_id) {
      return NextResponse.json({ error: 'No company associated with this user.' }, { status: 400 });
    }

    // 3. Fetch transactions for the user's company only
    const { data: transactions, error } = await supabaseAdmin
      .from('credit_transactions')
      .select(`
        transaction_id,
        amount,
        transaction_type,
        description,
        order_id,
        created_at,
        users ( email )
      `)
      .eq('company_id', userData.company_id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error(`Error fetching transactions for company ${userData.company_id}:`, error);
      return NextResponse.json({ error: `Database error: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json(transactions || [], { status: 200 });

  } catch (e: unknown) {
    console.error('Unexpected error in user transactions route:', e);
    return NextResponse.json({ error: 'An unexpected server error occurred.' }, { status: 500 });
  }
}