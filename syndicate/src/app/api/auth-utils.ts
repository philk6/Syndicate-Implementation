import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export async function getAuthUser(request: NextRequest) {
  // Try to get the token from the Authorization header
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { user: null, error: 'No authorization header found' };
  }

  const token = authHeader.replace('Bearer ', '');
  
  try {
    // Verify the JWT token
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    
    if (error || !user) {
      return { user: null, error: error?.message || 'Invalid token' };
    }

    // Get the user's role from the database
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (userError || !userData) {
      return { user: null, error: 'User not found in database' };
    }

    return { 
      user: {
        ...user,
        role: userData.role
      }, 
      error: null 
    };
  } catch {
    return { user: null, error: 'Failed to verify token' };
  }
}

interface AuthUser {
  id: string;
  email?: string;
  role?: string;
}

export function requireAdmin(user: AuthUser | null) {
  if (!user || user.role !== 'admin') {
    return false;
  }
  return true;
}