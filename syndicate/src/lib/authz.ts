/**
 * Authz helpers for server components and route handlers.
 *
 * Central place to resolve the current user's role from the session cookie
 * and to redirect (server-component) or throw (route handler) when the role
 * doesn't match the allow-list. Keeps role-check wiring out of the pages.
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export type Role = 'admin' | 'user' | 'employee';
export type RoleAllow = Role | 'admin-or-employee' | 'authenticated';

async function getServerClient() {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (cs) => {
          try {
            cs.forEach(({ name, value, options }) => store.set(name, value, options));
          } catch {
            /* server-component: can't set cookies; middleware handles refresh */
          }
        },
      },
    },
  );
}

export interface CurrentUser {
  user_id: string;
  email: string;
  role: Role;
}

/** Returns the currently-authenticated user + their role, or null if not signed in. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await getServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) return null;

  const { data: profile, error: profileErr } = await supabase
    .from('users')
    .select('role, email')
    .eq('user_id', user.id)
    .maybeSingle();
  if (profileErr || !profile) return null;

  return {
    user_id: user.id,
    email: (profile.email ?? user.email ?? '') as string,
    role: profile.role as Role,
  };
}

/**
 * Server-component guard. On failure, either redirects to /login (not signed
 * in) or /dashboard (signed in but wrong role). Returns the resolved user on
 * success, so pages can `const user = await requireRole('admin')` inline.
 */
export async function requireRole(allow: RoleAllow): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  if (allow === 'authenticated') return user;
  const matches =
    allow === 'admin-or-employee'
      ? user.role === 'admin' || user.role === 'employee'
      : user.role === allow;

  if (!matches) redirect('/dashboard');
  return user;
}

/**
 * Route-handler flavor. Doesn't redirect; throws tagged errors so the route
 * can return 401/403 responses.
 */
export async function assertRoleForRoute(allow: RoleAllow): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');

  if (allow === 'authenticated') return user;
  const matches =
    allow === 'admin-or-employee'
      ? user.role === 'admin' || user.role === 'employee'
      : user.role === allow;

  if (!matches) throw new Error('Forbidden');
  return user;
}
