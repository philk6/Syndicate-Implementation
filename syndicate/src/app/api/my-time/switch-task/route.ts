import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseServerClient, requireAuthenticatedUser } from '@/lib/supplierIntel/server';
import { TASK_TYPES, TASKS_REQUIRING_ORDER, type TaskType } from '@/lib/timeTracking';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/my-time/switch-task
// Body: { task, orderId?, projectId?, note? }
// Wraps the my_time_switch_task RPC (SECURITY INVOKER). Enforces the same
// VA-vs-employee tag rules as /clock-in.
export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAuthenticatedUser();
    const supabase = await getSupabaseServerClient();

    // Resolve the caller's role + team + isVa from the service-role side so
    // we can validate tag rules before calling the RPC.
    const svc = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
    );
    const { data: profile } = await svc.from('users').select('role').eq('user_id', user.id).maybeSingle();
    const role = profile?.role as 'user' | 'admin' | 'employee' | 'va' | undefined;
    const { data: employee } = await svc
      .from('employees')
      .select('id, team_id, active')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!employee || !employee.active) {
      return NextResponse.json({ error: 'No active employee record for current user' }, { status: 403 });
    }

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

    const isVa = role === 'va';
    const tagRequired = TASKS_REQUIRING_ORDER.includes(task);
    if (isVa) {
      if (orderId) return NextResponse.json({ error: 'VAs tag against projects, not orders' }, { status: 400 });
      if (tagRequired && !projectId) return NextResponse.json({ error: 'This task type requires a project' }, { status: 400 });
      if (projectId) {
        const { data: p } = await svc.from('team_projects').select('id, team_id, active').eq('id', projectId).maybeSingle();
        if (!p || p.team_id !== employee.team_id || !p.active) {
          return NextResponse.json({ error: 'Project not found in your team or archived' }, { status: 400 });
        }
      }
    } else {
      if (projectId) return NextResponse.json({ error: 'Warehouse employees tag against orders, not projects' }, { status: 400 });
      if (tagRequired && !orderId) return NextResponse.json({ error: 'This task type requires an order' }, { status: 400 });
    }

    const { data, error } = await supabase.rpc('my_time_switch_task', {
      p_new_task: task,
      p_new_order_id: orderId,
      p_new_project_id: projectId,
      p_new_note: note,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ data });
  } catch (e) {
    if (e instanceof Error && e.message === 'Not authenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[POST /api/my-time/switch-task]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
