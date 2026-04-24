/**
 * Shared server-side helper for the student/admin "My Team" portal.
 * Resolves the effective team a request is scoped to: either the current
 * student's own team, or the team the admin is operating on when they
 * visit /admin/teams/[teamId].
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { assertRoleForRoute, type CurrentUser } from '@/lib/authz';

export function getServiceRoleClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
}

/**
 * Returns the team the caller is operating on + the caller's user row.
 *
 * Resolution:
 *   - If `teamId` is provided, require admin OR the caller be that team's
 *     owner. Admins can view any team's data through the portal UI.
 *   - Otherwise, the caller must be a one-on-one student — we look up their
 *     own team (non-warehouse team where owner_id = their user_id).
 */
export async function resolveTeamContext(teamId?: string): Promise<{
  user: CurrentUser;
  svc: SupabaseClient;
  team: { id: string; name: string; owner_id: string; is_warehouse: boolean };
  isAdminImpersonating: boolean;
}> {
  const user = await assertRoleForRoute('admin-or-student');
  const svc = getServiceRoleClient();

  if (teamId) {
    if (user.role !== 'admin') {
      // Non-admin must own this team.
      const { data: ownCheck } = await svc
        .from('teams')
        .select('id, name, owner_id, is_warehouse')
        .eq('id', teamId)
        .maybeSingle();
      if (!ownCheck || ownCheck.owner_id !== user.user_id) {
        throw new Error('Forbidden');
      }
      return { user, svc, team: ownCheck as typeof ownCheck & { id: string; name: string; owner_id: string; is_warehouse: boolean }, isAdminImpersonating: false };
    }
    const { data: team } = await svc
      .from('teams')
      .select('id, name, owner_id, is_warehouse')
      .eq('id', teamId)
      .maybeSingle();
    if (!team) throw new Error('Team not found');
    return { user, svc, team: team as { id: string; name: string; owner_id: string; is_warehouse: boolean }, isAdminImpersonating: true };
  }

  // No teamId — student hitting /my-team.
  const { data: myTeam } = await svc
    .from('teams')
    .select('id, name, owner_id, is_warehouse')
    .eq('owner_id', user.user_id)
    .eq('is_warehouse', false)
    .maybeSingle();

  if (!myTeam) {
    // The student flag was probably just flipped and the migration API
    // didn't get to create a team. Surface a clear error instead of a
    // confusing empty UI.
    throw new Error('No team found for current user');
  }

  return { user, svc, team: myTeam as { id: string; name: string; owner_id: string; is_warehouse: boolean }, isAdminImpersonating: false };
}
