import { NextRequest, NextResponse } from 'next/server';
import { createId } from '@paralleldrive/cuid2';
import {
  getSupabaseServerClient,
  requireAuthenticatedUser,
} from '@/lib/supplierIntel/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/supplier-intel/follow-up/action
// Body: { follow_up_id, action, detail? }
export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAuthenticatedUser();
    const supabase = await getSupabaseServerClient();

    const body = await req.json().catch(() => ({}));
    const follow_up_id: string = body.follow_up_id ?? '';
    const action: string = body.action ?? '';
    const detail: string | null = body.detail ?? null;

    if (!follow_up_id || !action) {
      return NextResponse.json({ error: 'follow_up_id and action are required' }, { status: 400 });
    }

    const id = createId();
    const { error } = await supabase.rpc('si_log_follow_up_action', {
      p_id: id,
      p_follow_up_id: follow_up_id,
      p_action: action,
      p_detail: detail,
      p_performed_by: user.id,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: { id } }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === 'Not authenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[POST /api/supplier-intel/follow-up/action]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
