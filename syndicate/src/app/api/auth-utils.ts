import { NextRequest } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _admin: SupabaseClient | null = null;

function getAdmin(): SupabaseClient {
  if (_admin) return _admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE env vars for admin client');
  _admin = createClient(url, key);
  return _admin;
}

// Lazy proxy so existing imports of `supabaseAdmin` keep working
export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = getAdmin();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

export async function getAuthUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { user: null, error: 'No authorization header found' };
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const supabaseAdmin = getAdmin();
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return { user: null, error: error?.message || 'Invalid token' };
    }

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
        role: userData.role,
      },
      error: null,
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
