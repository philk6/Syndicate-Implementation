// /src/app/api/admin/credits/transactions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, getAuthUser, requireAdmin } from '@/app/api/auth-utils';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // 1. Authenticate and authorize the admin user
  const { user, error: authError } = await getAuthUser(request);

  if (authError || !user) {
    return NextResponse.json({ error: `Authentication failed: ${authError}` }, { status: 401 });
  }

  if (!requireAdmin(user)) {
    return NextResponse.json({ error: 'Forbidden: Administrator privileges required.' }, { status: 403 });
  }

  try {
    // 2. Fetch all transactions using the admin client to bypass RLS
    const { data: transactions, error } = await supabaseAdmin
      .from('credit_transactions')
      .select(`
        transaction_id,
        amount,
        transaction_type,
        description,
        order_id,
        created_at,
        company ( name ),
        users ( email )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching credit transactions:', error);
      return NextResponse.json({ error: `Database error: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json(transactions || [], { status: 200 });

  } catch (e: unknown) {
    console.error('Unexpected error in transactions route:', e);
    return NextResponse.json({ error: 'An unexpected server error occurred.' }, { status: 500 });
  }
}
