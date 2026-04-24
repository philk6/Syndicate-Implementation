import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assertRoleForRoute } from '@/lib/authz';
import { TASK_TYPES, type TaskType } from '@/lib/timeTracking';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RouteCtx = { params: Promise<{ id: string }> };

// PATCH /api/admin/time-entries/[id]
// Body: { started_at?, ended_at?, task?, order_id?, note? } — partial update.
// Writes an audit row to time_entry_edits with before/after snapshots.
export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  try {
    const admin = await assertRoleForRoute('admin');
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));

    const svc = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
    );

    const { data: before, error: beforeErr } = await svc
      .from('time_entries')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (beforeErr) return NextResponse.json({ error: beforeErr.message }, { status: 500 });
    if (!before) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const patch: Record<string, unknown> = {
      edited_by: admin.user_id,
      edited_at: new Date().toISOString(),
    };
    if (typeof body.started_at === 'string') patch.started_at = new Date(body.started_at).toISOString();
    if (body.ended_at === null) patch.ended_at = null;
    else if (typeof body.ended_at === 'string') patch.ended_at = new Date(body.ended_at).toISOString();
    if (typeof body.task === 'string' && TASK_TYPES.includes(body.task as TaskType)) patch.task = body.task;
    if (body.order_id === null) patch.order_id = null;
    else if (typeof body.order_id === 'number') patch.order_id = body.order_id;
    if (typeof body.note === 'string') patch.note = body.note.slice(0, 500);
    else if (body.note === null) patch.note = null;

    const { data: after, error: updErr } = await svc
      .from('time_entries')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });

    // Audit: only log actual-change edits (not pure no-ops).
    await svc.from('time_entry_edits').insert({
      time_entry_id: id,
      edited_by: admin.user_id,
      before_snapshot: before,
      after_snapshot: after,
    });

    return NextResponse.json({ data: after });
  } catch (e) {
    if (e instanceof Error && e.message === 'Not authenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    console.error('[PATCH /api/admin/time-entries/[id]]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/admin/time-entries/[id]
export async function DELETE(_req: NextRequest, ctx: RouteCtx) {
  try {
    const admin = await assertRoleForRoute('admin');
    const { id } = await ctx.params;

    const svc = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
    );

    const { data: before } = await svc.from('time_entries').select('*').eq('id', id).maybeSingle();
    if (!before) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Audit BEFORE delete so the snapshot is captured.
    await svc.from('time_entry_edits').insert({
      time_entry_id: id,
      edited_by: admin.user_id,
      before_snapshot: before,
      after_snapshot: { deleted: true },
    });

    const { error } = await svc.from('time_entries').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === 'Not authenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    console.error('[DELETE /api/admin/time-entries/[id]]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
