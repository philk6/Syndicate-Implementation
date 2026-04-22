import { NextRequest, NextResponse } from 'next/server';
import { createId } from '@paralleldrive/cuid2';
import {
  getSupabaseServerClient,
  requireAuthenticatedUser,
} from '@/lib/supplierIntel/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/supplier-intel/follow-up/templates
export async function GET() {
  try {
    await requireAuthenticatedUser();
    const supabase = await getSupabaseServerClient();

    const { data, error } = await supabase
      .from('si_email_templates')
      .select('*')
      .order('sequence_step', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
  } catch (e) {
    if (e instanceof Error && e.message === 'Not authenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[GET /api/supplier-intel/follow-up/templates]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/supplier-intel/follow-up/templates
// Body: { name, subject, body, sequence_step, description? }
export async function POST(req: NextRequest) {
  try {
    await requireAuthenticatedUser();
    const supabase = await getSupabaseServerClient();

    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
    const bodyText = typeof body.body === 'string' ? body.body : '';
    const sequence_step = typeof body.sequence_step === 'number' ? body.sequence_step : 0;
    const priority = typeof body.priority === 'string' ? body.priority : 'ALL';

    if (!name || !subject || !bodyText) {
      return NextResponse.json({ error: 'name, subject and body are required' }, { status: 400 });
    }

    const id = createId();
    const { data, error } = await supabase
      .from('si_email_templates')
      .insert({ id, name, subject, body: bodyText, sequence_step, priority })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === 'Not authenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[POST /api/supplier-intel/follow-up/templates]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
