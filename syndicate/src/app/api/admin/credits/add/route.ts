export const dynamic = 'force-dynamic';
// /src/app/api/admin/credits/add/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, getAuthUser, requireAdmin } from '@/app/api/auth-utils';

export async function POST(request: NextRequest) {
  // 1. Authenticate and authorize the admin user
  const { user, error: authError } = await getAuthUser(request);

  if (authError || !user) {
    return NextResponse.json({ error: `Authentication failed: ${authError}` }, { status: 401 });
  }

  if (!requireAdmin(user)) {
    return NextResponse.json({ error: 'Forbidden: Administrator privileges required.' }, { status: 403 });
  }

  // 2. Get the request body
  const { company_id, amount, description } = await request.json();

  // 3. Validate input
  if (!company_id || typeof amount !== 'number' || !description) {
    return NextResponse.json({ error: 'Missing required fields: company_id, amount, description' }, { status: 400 });
  }

  try {
    // 4. Call the updated `add_credit` database function
    const { error: rpcError } = await supabaseAdmin.rpc('add_credit', {
      p_company_id: company_id,
      p_amount: amount,
      p_description: description,
      p_created_by: user.id // Pass the admin's user ID for auditing
    });

    if (rpcError) {
      console.error('RPC Error adding credit:', rpcError);
      return NextResponse.json({ error: `Database function error: ${rpcError.message}` }, { status: 500 });
    }

    return NextResponse.json({ message: 'Credit processed successfully.' }, { status: 200 });

  } catch (e: unknown) {
    console.error('Unexpected error in add credit route:', e);
    return NextResponse.json({ error: 'An unexpected server error occurred.' }, { status: 500 });
  }
}
