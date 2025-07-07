// /src/app/api/admin/credits/transactions/[company_id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, getAuthUser, requireAdmin } from '@/app/api/auth-utils';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ company_id: string }> }) {
  // 1. Authenticate and authorize the admin user
  const { user, error: authError } = await getAuthUser(request);

  if (authError || !user) {
    return NextResponse.json({ error: `Authentication failed: ${authError}` }, { status: 401 });
  }

  if (!requireAdmin(user)) {
    return NextResponse.json({ error: 'Forbidden: Administrator privileges required.' }, { status: 403 });
  }

  // 2. Validate the company_id from the URL
  const { company_id } = await params;
  const companyId = parseInt(company_id, 10);
  if (isNaN(companyId)) {
    return NextResponse.json({ error: 'Invalid company ID provided.' }, { status: 400 });
  }

  try {
    // 3. Fetch transactions for the specific company using the admin client
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
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error(`Error fetching transactions for company ${companyId}:`, error);
      return NextResponse.json({ error: `Database error: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json(transactions || [], { status: 200 });

  } catch (e: unknown) {
    console.error('Unexpected error in transactions route:', e);
    return NextResponse.json({ error: 'An unexpected server error occurred.' }, { status: 500 });
  }
}
