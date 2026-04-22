import { NextRequest, NextResponse } from 'next/server';
import { createId } from '@paralleldrive/cuid2';
import {
  getSupabaseServerClient,
  requireAuthenticatedUser,
} from '@/lib/supplierIntel/server';
import type { OutreachEventType } from '@/lib/supplierIntel/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RouteCtx = { params: Promise<{ supplierId: string }> };

const VALID_TYPES: OutreachEventType[] = [
  'EMAIL_DRAFTED',
  'EMAIL_LOGGED',
  'FOLLOW_UP_LOGGED',
  'CALL_LOGGED',
  'REPLY_LOGGED',
  'NOTE',
];

// POST /api/supplier-intel/suppliers/[supplierId]/outreach
// Body: { type, subject?, body?, outcome?, note?, sequence_step? }
export async function POST(req: NextRequest, ctx: RouteCtx) {
  try {
    const { user } = await requireAuthenticatedUser();
    const supabase = await getSupabaseServerClient();
    const { supplierId } = await ctx.params;

    const body = await req.json().catch(() => ({}));
    const type = typeof body.type === 'string' ? body.type : '';
    if (!VALID_TYPES.includes(type as OutreachEventType)) {
      return NextResponse.json({ error: `Invalid type. Must be one of ${VALID_TYPES.join(', ')}` }, { status: 400 });
    }

    const sequence_step = typeof body.sequence_step === 'number' ? body.sequence_step : 0;
    const id = createId();

    const { error } = await supabase.rpc('si_log_outreach_event', {
      p_id: id,
      p_supplier_id: supplierId,
      p_type: type,
      p_subject: body.subject ?? null,
      p_body: body.body ?? null,
      p_outcome: body.outcome ?? null,
      p_note: body.note ?? null,
      p_logged_by: user.id,
      p_sequence_step: sequence_step,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: { id } }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === 'Not authenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[POST /api/supplier-intel/suppliers/[supplierId]/outreach]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
