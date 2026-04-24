import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient, requireAuthenticatedUser } from '@/lib/supplierIntel/server';
import { TASK_TYPES, TASKS_REQUIRING_ORDER, type TaskType } from '@/lib/timeTracking';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/my-time/switch-task
// Body: { task: TaskType; orderId?: number | null; note?: string | null }
// Wraps the my_time_switch_task RPC (SECURITY INVOKER), so the caller's
// own JWT drives the row-level auth. We use the ssr server client to
// forward the caller's auth cookie rather than the service role.
export async function POST(req: NextRequest) {
  try {
    await requireAuthenticatedUser();
    const supabase = await getSupabaseServerClient();

    const body = await req.json().catch(() => ({}));
    const task = body.task as TaskType;
    const orderId: number | null = body.orderId != null ? Number(body.orderId) : null;
    const note: string | null = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null;

    if (!TASK_TYPES.includes(task)) {
      return NextResponse.json({ error: `Invalid task. Must be one of ${TASK_TYPES.join(', ')}` }, { status: 400 });
    }
    if (TASKS_REQUIRING_ORDER.includes(task) && !orderId) {
      return NextResponse.json({ error: 'This task type requires an order_id' }, { status: 400 });
    }
    if (note && note.length > 500) {
      return NextResponse.json({ error: 'Note must be 500 chars or fewer' }, { status: 400 });
    }

    const { data, error } = await supabase.rpc('my_time_switch_task', {
      p_new_task: task,
      p_new_order_id: orderId,
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
