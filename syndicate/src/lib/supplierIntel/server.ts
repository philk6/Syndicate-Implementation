/**
 * Server-side Supabase client factory for Supplier Intel routes.
 *
 * All Supplier Intel server routes / server actions use this helper.
 * It wires up `@supabase/ssr`'s cookie protocol so RLS gets the correct
 * `auth.uid()` for whoever's logged into Syndicate.
 *
 * For routes that need to bypass RLS (e.g. writing a row that the caller
 * owns indirectly, or background jobs), import `getServiceRoleClient()`
 * separately.
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Browser-cookie-aware server client. Use in route handlers and server
 * components. RLS applies as the current user.
 */
export async function getSupabaseServerClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — cookies can't be set here.
            // Middleware handles session refresh; ignore.
          }
        },
      },
    },
  );
}

let _serviceRoleClient: SupabaseClient | null = null;

/**
 * Service-role client. Bypasses RLS. Use for:
 *   - Background analyze jobs where the worker isn't logged-in as a user.
 *   - Admin endpoints (rescore) where we've already gated on role === 'admin'.
 * NEVER expose to client components.
 */
export function getServiceRoleClient(): SupabaseClient {
  if (_serviceRoleClient) return _serviceRoleClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  _serviceRoleClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return _serviceRoleClient;
}

/**
 * Returns the authenticated Syndicate user, or throws 401-shaped error.
 * Wraps the common `getUser()` + null-check pattern.
 */
export async function requireAuthenticatedUser() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    throw new Error('Not authenticated');
  }
  return { supabase, user };
}

/**
 * Returns the authenticated user AND verifies they are a Syndicate admin
 * (public.users.role === 'admin'). Throws otherwise.
 */
export async function requireAdminUser() {
  const { supabase, user } = await requireAuthenticatedUser();
  const { data: profile, error } = await supabase
    .from('users')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error || !profile || profile.role !== 'admin') {
    throw new Error('Admin access required');
  }
  return { supabase, user };
}
