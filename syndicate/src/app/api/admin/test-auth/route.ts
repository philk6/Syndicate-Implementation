// /src/app/api/admin/test-auth/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requireAdmin } from '@/app/api/auth-utils';

// IMPORTANT: This forces the route to be dynamic
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  console.log('API test-auth: Starting authentication check with service role auth');

  try {
    // 1. Authenticate the user using the auth utility
    const { user, error: authError } = await getAuthUser(request);

    if (authError || !user) {
      console.warn('API test-auth - Auth failed:', authError);
      return NextResponse.json({ error: `Authentication failed: ${authError}` }, { status: 401 });
    }

    // 2. Verify the user is an admin
    if (!requireAdmin(user)) {
      console.warn(`API test-auth - Forbidden access for user ${user.id} with role ${user.role}`);
      return NextResponse.json({ error: 'Forbidden: Administrator privileges required.' }, { status: 403 });
    }

    // 3. Success response
    console.log(`API Auth Success - Admin access granted for: ${user.email}`);
    return NextResponse.json({
      success: true,
      message: 'Authentication successful. Admin access confirmed.',
      user: {
        userId: user.id,
        email: user.email,
        role: user.role,
      }
    });

  } catch (e: unknown) {
    console.error('API Auth Error - Unexpected error:', e);
    return NextResponse.json({ error: 'An unexpected server error occurred.', details: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}
