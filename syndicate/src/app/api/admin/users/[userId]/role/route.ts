import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assertRoleForRoute } from '@/lib/authz';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ALLOWED_ROLES = ['user', 'admin', 'employee', 'va'] as const;
type Role = (typeof ALLOWED_ROLES)[number];

type RouteCtx = { params: Promise<{ userId: string }> };

// PATCH /api/admin/users/[userId]/role
// Body: { role: Role; team_id?: string } — team_id required when role === 'va'
//
// Mutates users.role, manages the employees row (insert/reactivate/deactivate
// without ever deleting), and writes a user_role_changes audit row. History
// rows (time_entries, va_daily_reports, employee_rates, time_entry_edits)
// are never touched.
export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  try {
    const admin = await assertRoleForRoute('admin');
    const { userId: targetUserId } = await ctx.params;

    const body = await req.json().catch(() => ({}));
    const newRole = body.role as Role;
    const teamId: string | undefined =
      typeof body.team_id === 'string' && body.team_id ? body.team_id : undefined;

    if (!ALLOWED_ROLES.includes(newRole)) {
      return NextResponse.json({ ok: false, error: 'invalid_role' }, { status: 400 });
    }

    const svc = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
    );

    const { data: targetRow, error: targetErr } = await svc
      .from('users')
      .select('user_id, role, email, firstname, lastname')
      .eq('user_id', targetUserId)
      .maybeSingle();
    if (targetErr) {
      return NextResponse.json({ ok: false, error: targetErr.message }, { status: 500 });
    }
    if (!targetRow) {
      return NextResponse.json({ ok: false, error: 'user_not_found' }, { status: 404 });
    }

    const oldRole = targetRow.role as Role;

    if (newRole === 'va' && !teamId) {
      return NextResponse.json({ ok: false, error: 'team_id_required_for_va' }, { status: 400 });
    }
    if (newRole === 'va') {
      // The picked team must exist and not be the warehouse singleton.
      const { data: team } = await svc
        .from('teams')
        .select('id, is_warehouse')
        .eq('id', teamId!)
        .maybeSingle();
      if (!team) {
        return NextResponse.json({ ok: false, error: 'team_not_found' }, { status: 400 });
      }
      if (team.is_warehouse) {
        return NextResponse.json({ ok: false, error: 'va_cannot_be_in_warehouse_team' }, { status: 400 });
      }
    }

    // 1. Update the role.
    {
      const { error } = await svc
        .from('users')
        .update({ role: newRole })
        .eq('user_id', targetUserId);
      if (error) {
        return NextResponse.json({ ok: false, error: 'update_role_failed', detail: error.message }, { status: 500 });
      }
    }

    // 2. Side-effects.
    // 2a. Leaving va/employee for something else → mark the employees row inactive.
    if ((oldRole === 'va' || oldRole === 'employee') && newRole !== 'va' && newRole !== 'employee') {
      await svc.from('employees').update({ active: false }).eq('user_id', targetUserId);
    }

    // 2b. Becoming an employee → ensure they have a Warehouse-team employees row.
    if (newRole === 'employee') {
      const { data: warehouseTeam } = await svc
        .from('teams').select('id').eq('is_warehouse', true).maybeSingle();
      if (!warehouseTeam) {
        return NextResponse.json({ ok: false, error: 'no_warehouse_team' }, { status: 500 });
      }

      const { data: existing } = await svc
        .from('employees')
        .select('id')
        .eq('user_id', targetUserId)
        .maybeSingle();

      const fallbackFirst = (targetRow.firstname as string | null) ?? targetRow.email?.split('@')[0] ?? 'Employee';
      const fallbackLast = (targetRow.lastname as string | null) ?? '';

      if (existing) {
        await svc
          .from('employees')
          .update({
            active: true,
            team_id: warehouseTeam.id,
            va_profile: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
      } else {
        const { data: created } = await svc
          .from('employees')
          .insert({
            user_id: targetUserId,
            team_id: warehouseTeam.id,
            first_name: fallbackFirst,
            last_name: fallbackLast,
            employment_start_date: new Date().toISOString().slice(0, 10),
            active: true,
          })
          .select('id')
          .single();
        if (created) {
          await svc.from('employee_rates').insert({
            employee_id: created.id,
            hourly_rate: 0,
            created_by: admin.user_id,
          });
        }
      }
    }

    // 2c. Becoming a VA → ensure they have an employees row in the chosen team.
    if (newRole === 'va') {
      const { data: existing } = await svc
        .from('employees')
        .select('id')
        .eq('user_id', targetUserId)
        .maybeSingle();

      const fallbackFirst = (targetRow.firstname as string | null) ?? targetRow.email?.split('@')[0] ?? 'VA';
      const fallbackLast = (targetRow.lastname as string | null) ?? '';

      if (existing) {
        await svc
          .from('employees')
          .update({
            active: true,
            team_id: teamId!,
            va_profile: 'operations',
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
      } else {
        const { data: created } = await svc
          .from('employees')
          .insert({
            user_id: targetUserId,
            team_id: teamId!,
            va_profile: 'operations',
            first_name: fallbackFirst,
            last_name: fallbackLast,
            employment_start_date: new Date().toISOString().slice(0, 10),
            active: true,
          })
          .select('id')
          .single();
        if (created) {
          await svc.from('employee_rates').insert({
            employee_id: created.id,
            hourly_rate: 0,
            created_by: admin.user_id,
          });
        }
      }
    }

    // 3. Audit log.
    await svc.from('user_role_changes').insert({
      user_id: targetUserId,
      changed_by: admin.user_id,
      from_role: oldRole,
      to_role: newRole,
      metadata: { team_id: teamId ?? null },
    });

    return NextResponse.json({ ok: true, from: oldRole, to: newRole });
  } catch (e) {
    if (e instanceof Error && e.message === 'Not authenticated') {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }
    if (e instanceof Error && e.message === 'Forbidden') {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    }
    console.error('[PATCH /api/admin/users/[userId]/role]', e);
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 });
  }
}
