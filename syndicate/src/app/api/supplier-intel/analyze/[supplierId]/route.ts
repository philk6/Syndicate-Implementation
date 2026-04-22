import { NextRequest, NextResponse } from 'next/server';
import { createId } from '@paralleldrive/cuid2';
import {
  getSupabaseServerClient,
  requireAuthenticatedUser,
} from '@/lib/supplierIntel/server';
import { generateStubAnalysis } from '@/lib/supplierIntel/stubAnalysis';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RouteCtx = { params: Promise<{ supplierId: string }> };

// POST /api/supplier-intel/analyze/[supplierId]
// Stubbed Claude analyzer. Returns a deterministic but varied AnalysisResult,
// writes it to si_supplier_analyses, and marks the supplier DONE.
export async function POST(_req: NextRequest, ctx: RouteCtx) {
  try {
    await requireAuthenticatedUser();
    const supabase = await getSupabaseServerClient();
    const { supplierId } = await ctx.params;

    const { data: supplier, error: supErr } = await supabase
      .from('si_suppliers')
      .select('id, company_name, website')
      .eq('id', supplierId)
      .maybeSingle();
    if (supErr) return NextResponse.json({ error: supErr.message }, { status: 500 });
    if (!supplier) return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });

    // Mark ANALYZING for realism
    await supabase
      .from('si_suppliers')
      .update({ status: 'ANALYZING', updated_at: new Date().toISOString() })
      .eq('id', supplierId);

    // Fake latency — realistic Claude call
    await new Promise((r) => setTimeout(r, 1500));

    const result = generateStubAnalysis(supplier.company_name, supplier.website);

    const analysisId = createId();
    const { error: insErr } = await supabase.from('si_supplier_analyses').insert({
      id: analysisId,
      supplier_id: supplierId,
      classification: result.classification,
      confidence_level: result.confidenceLevel,
      supplier_quality_score: result.supplierQualityScore,
      amazon_fit_score: result.amazonFitScore,
      priority_level: result.priorityLevel,
      score: result.score,
      legitimacy_score: result.scoreBreakdown.legitimacy.score,
      wholesale_structure_score: result.scoreBreakdown.wholesaleStructure.score,
      supply_chain_doc_score: result.scoreBreakdown.supplyChainDoc.score,
      amazon_wholesale_fit_score: result.scoreBreakdown.amazonWholesaleFit.score,
      red_flag_penalty: result.scoreBreakdown.redFlagPenalty.penalty,
      recommendation: result.recommendation,
      score_breakdown: result.scoreBreakdown,
      green_flags: result.greenFlags,
      red_flags: result.redFlags,
      reasoning_summary: result.reasoningSummary,
      extracted_signals: result.extractedSignals,
      scrape_diagnostics: result.scrapeDiagnostics,
      raw_llm_response: result.rawLlmResponse,
    });
    if (insErr) {
      await supabase
        .from('si_suppliers')
        .update({ status: 'FAILED', updated_at: new Date().toISOString() })
        .eq('id', supplierId);
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    await supabase
      .from('si_suppliers')
      .update({ status: 'DONE', updated_at: new Date().toISOString() })
      .eq('id', supplierId);

    return NextResponse.json({ data: { analysisId, ...result } });
  } catch (e) {
    if (e instanceof Error && e.message === 'Not authenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[POST /api/supplier-intel/analyze]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
