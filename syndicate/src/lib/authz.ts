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

export type Role = 'admin' | 'user' | 'employee' | 'va';
export type RoleAllow =
  | Role
  | 'admin-or-employee'
  | 'admin-or-employee-or-va'
  | 'admin-or-student'
  | 'authenticated';

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
  is_one_on_one_student: boolean;
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
    .select('role, email, is_one_on_one_student')
    .eq('user_id', user.id)
    .maybeSingle();
  if (profileErr || !profile) return null;

  return {
    user_id: user.id,
    email: (profile.email ?? user.email ?? '') as string,
    role: profile.role as Role,
    is_one_on_one_student: Boolean(profile.is_one_on_one_student),
  };
}

/**
 * Server-component guard. On failure, either redirects to /login (not signed
 * in) or /dashboard (signed in but wrong role). Returns the resolved user on
 * success, so pages can `const user = await requireRole('admin')` inline.
 */
function roleMatches(allow: RoleAllow, user: CurrentUser): boolean {
  if (allow === 'authenticated') return true;
  if (allow === 'admin-or-employee') return user.role === 'admin' || user.role === 'employee';
  if (allow === 'admin-or-employee-or-va') {
    return user.role === 'admin' || user.role === 'employee' || user.role === 'va';
  }
  if (allow === 'admin-or-student') return user.role === 'admin' || user.is_one_on_one_student;
  return user.role === allow;
}

export async function requireRole(allow: RoleAllow): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!roleMatches(allow, user)) redirect('/dashboard');
  return user;
}

/** Admins or the user who owns this team. Redirects otherwise. */
export async function requireTeamOwner(teamId: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role === 'admin') return user;

  const supabase = await getServerClient();
  const { data: team } = await supabase
    .from('teams')
    .select('owner_id')
    .eq('id', teamId)
    .maybeSingle();

  if (!team || team.owner_id !== user.user_id) redirect('/dashboard');
  return user;
}

/**
 * Route-handler flavor. Doesn't redirect; throws tagged errors so the route
 * can return 401/403 responses.
 */
export async function assertRoleForRoute(allow: RoleAllow): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  if (!roleMatches(allow, user)) throw new Error('Forbidden');
  return user;
}

/** Route-handler flavor of requireTeamOwner — throws on mismatch. */
export async function assertTeamOwner(teamId: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  if (user.role === 'admin') return user;

  const supabase = await getServerClient();
  const { data: team } = await supabase
    .from('teams')
    .select('owner_id')
    .eq('id', teamId)
    .maybeSingle();

  if (!team || team.owner_id !== user.user_id) throw new Error('Forbidden');
  return user;
}
