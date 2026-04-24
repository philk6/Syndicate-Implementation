import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assertRoleForRoute } from '@/lib/authz';
import { TASK_TYPES, TASKS_REQUIRING_ORDER, type TaskType } from '@/lib/timeTracking';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/my-time/clock-in
// Body: { task, orderId?, projectId?, note? }
// Rules:
//   - warehouse employee + tagged task → orderId required, projectId rejected
//   - VA + tagged task                → projectId required, orderId rejected
//                                       projectId must belong to VA's team
//   - untagged tasks (cleaning/break/other/receiving_general) → no tag
//   - already-clocked-in → 409
//   - inactive employee  → 403
export async function POST(req: NextRequest) {
  try {
    const me = await assertRoleForRoute('admin-or-employee-or-va');

    const body = await req.json().catch(() => ({}));
    const task = body.task as TaskType;
    const orderId: number | null = body.orderId != null && body.orderId !== '' ? Number(body.orderId) : null;
    const projectId: string | null = typeof body.projectId === 'string' && body.projectId ? body.projectId : null;
    const note: string | null = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null;

    if (!TASK_TYPES.includes(task)) {
      return NextResponse.json({ error: `Invalid task. Must be one of ${TASK_TYPES.join(', ')}` }, { status: 400 });
    }
    if (note && note.length > 500) {
      return NextResponse.json({ error: 'Note must be 500 chars or fewer' }, { status: 400 });
    }

    const service = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
    );

    const { data: employee, error: empErr } = await service
      .from('employees')
      .select('id, active, team_id')
      .eq('user_id', me.user_id)
      .maybeSingle();
    if (empErr) return NextResponse.json({ error: empErr.message }, { status: 500 });
    if (!employee) return NextResponse.json({ error: 'No employee record for this user' }, { status: 404 });
    if (!employee.active) {
      return NextResponse.json({ error: 'Your account is inactive — contact your admin.' }, { status: 403 });
    }

    const isVa = me.role === 'va';
    const tagRequired = TASKS_REQUIRING_ORDER.includes(task);

    if (isVa) {
      if (orderId) {
        return NextResponse.json({ error: 'VAs tag time entries against projects, not orders' }, { status: 400 });
      }
      if (tagRequired && !projectId) {
        return NextResponse.json({ error: 'This task type requires a project' }, { status: 400 });
      }
      if (projectId) {
        // project must belong to the VA's team + be active.
        const { data: p } = await service
          .from('team_projects')
          .select('id, team_id, active')
          .eq('id', projectId)
          .maybeSingle();
        if (!p || p.team_id !== employee.team_id || !p.active) {
          return NextResponse.json({ error: 'Project not found in your team or archived' }, { status: 400 });
        }
      }
    } else {
      if (projectId) {
        return NextResponse.json({ error: 'Warehouse employees tag against orders, not projects' }, { status: 400 });
      }
      if (tagRequired && !orderId) {
        return NextResponse.json({ error: 'This task type requires an order' }, { status: 400 });
      }
    }

    const { data: existing } = await service
      .from('time_entries')
      .select('id')
      .eq('employee_id', employee.id)
      .is('ended_at', null)
      .limit(1)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ error: 'Already clocked in. Use Switch Task or Clock Out.' }, { status: 409 });
    }

    const { data, error } = await service
      .from('time_entries')
      .insert({
        employee_id: employee.id,
        task,
        order_id: orderId,
        project_id: projectId,
        note,
      })
      .select('id, started_at, ended_at, task, order_id, project_id, note')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === 'Not authenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (e instanceof Error && e.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    console.error('[POST /api/my-time/clock-in]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
