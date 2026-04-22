import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/supplierIntel/server';
import type { SupplierContext } from '@/lib/supplierIntel/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/supplier-intel/chat
// Body: { message: string, supplierContext?: SupplierContext, history?: {role,content}[] }
// Stubbed Claude chat — returns a reply that references the supplier context.
export async function POST(req: NextRequest) {
  try {
    await requireAuthenticatedUser();
    const body = await req.json().catch(() => ({}));
    const message: string = typeof body.message === 'string' ? body.message : '';
    const ctx: SupplierContext | undefined = body.supplierContext;

    if (!message.trim()) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    // Fake latency — realistic assistant response
    await new Promise((r) => setTimeout(r, 900));

    const reply = buildReply(message, ctx);
    return NextResponse.json({ data: { reply, model: 'claude-opus-4-stub' } });
  } catch (e) {
    if (e instanceof Error && e.message === 'Not authenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[POST /api/supplier-intel/chat]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function buildReply(message: string, ctx?: SupplierContext): string {
  const lower = message.toLowerCase();
  const name = ctx?.companyName ?? 'this supplier';

  if (/green.?flag|positive|strength/.test(lower) && ctx?.greenFlags?.length) {
    return `Here are the positives I found for ${name}:\n\n${ctx.greenFlags
      .map((g, i) => `${i + 1}. ${g}`)
      .join('\n')}\n\nThese signals support the "${ctx.recommendation ?? 'current'}" recommendation. If you want, I can draft a first-touch email framed around these strengths.`;
  }

  if (/red.?flag|risk|concern|worry/.test(lower) && ctx?.redFlags?.length) {
    return `The concerns flagged for ${name}:\n\n${ctx.redFlags
      .map((r, i) => `${i + 1}. ${r}`)
      .join('\n')}\n\nBefore pursuing outreach I'd recommend clarifying the Amazon-authorization path directly with their wholesale team.`;
  }

  if (/email|outreach|contact|write/.test(lower)) {
    return `Based on ${name}'s profile${ctx?.recommendation ? ` (${ctx.recommendation})` : ''}, here's a first-touch draft:\n\nSubject: Wholesale inquiry — authorized Amazon reseller\n\nHi ${name} team,\n\nI run a vetted Amazon wholesale operation with an established seller account (4+ years, 99% positive feedback). I'm interested in stocking your catalog and would like to submit a reseller application.\n\nCan you confirm whether you have an authorization process for Amazon marketplace sellers, and point me toward your wholesale application?\n\nHappy to provide EIN, resale certificate, and references on request.\n\nThanks,\n[Your name]\n\n---\n\nLet me know if you want it tightened or customized to a specific product line.`;
  }

  if (/score|recommend|analysis|breakdown/.test(lower) && ctx?.score !== undefined) {
    return `${name} scored ${ctx.score}/100 (${ctx.recommendation ?? 'unknown'}). Breakdown at a glance:\n\n- Classification: ${ctx.classification ?? 'unclear'}\n- Confidence: ${ctx.confidence ?? 'moderate'}\n- Green flags: ${ctx.greenFlags?.length ?? 0}\n- Red flags: ${ctx.redFlags?.length ?? 0}\n\n${ctx.reasoningSummary ?? 'Reasoning summary not available.'}`;
  }

  return `I'm here to help with your analysis of ${name}. You can ask me to:\n\n• Explain the green or red flags in more detail\n• Draft a cold-outreach email\n• Compare this supplier against another on your list\n• Suggest follow-up questions to ask their wholesale team\n\nWhat would you like to dig into?`;
}
