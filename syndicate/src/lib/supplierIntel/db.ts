/**
 * Data-access layer for Supplier Intel tables.
 * One set of typed functions per table, used by route handlers and server components.
 * Auth flows via the caller-provided SupabaseClient (RLS applies).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createId } from '@paralleldrive/cuid2';
import type {
  SupplierStatus,
  SupplierWorkflowStatus,
  OutreachStatus,
  Classification,
  Confidence,
  PriorityLevel,
  Recommendation,
  OutreachEventType,
  NextActionType,
} from './types';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface SiSupplierList {
  id: string;
  name: string;
  user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SiSupplier {
  id: string;
  list_id: string;
  company_name: string;
  website: string | null;
  notes: string | null;
  status: SupplierStatus;
  workflow_status: SupplierWorkflowStatus;
  rejection_reason: string | null;
  outreach_status: OutreachStatus;
  next_action_type: NextActionType | null;
  next_action_date: string | null;
  next_action_note: string | null;
  last_contact_at: string | null;
  outreach_started_at: string | null;
  sequence_step: number;
  last_action_at: string | null;
  last_action_by: string | null;
  outreach_priority: string;
  created_at: string;
  updated_at: string;
}

export interface SiAnalysis {
  id: string;
  supplier_id: string;
  classification: Classification;
  confidence_level: Confidence;
  supplier_quality_score: number;
  amazon_fit_score: number;
  priority_level: PriorityLevel;
  score: number;
  legitimacy_score: number;
  wholesale_structure_score: number;
  supply_chain_doc_score: number;
  amazon_wholesale_fit_score: number;
  red_flag_penalty: number;
  recommendation: Recommendation;
  score_breakdown: unknown;
  green_flags: unknown;
  red_flags: unknown;
  reasoning_summary: string;
  extracted_signals: unknown;
  scrape_diagnostics: unknown;
  raw_llm_response: unknown;
  analyzed_at: string;
  created_at: string;
}

// ─── Lists ─────────────────────────────────────────────────────────────────

export async function listSupplierLists(supabase: SupabaseClient, userId: string) {
  return supabase
    .from('si_supplier_lists')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
}

export async function getSupplierList(supabase: SupabaseClient, listId: string) {
  return supabase.from('si_supplier_lists').select('*').eq('id', listId).maybeSingle();
}

export async function createSupplierList(
  supabase: SupabaseClient,
  userId: string,
  name: string,
) {
  const id = createId();
  return supabase
    .from('si_supplier_lists')
    .insert({ id, name, user_id: userId })
    .select()
    .single();
}

export async function updateSupplierList(
  supabase: SupabaseClient,
  listId: string,
  patch: Partial<Pick<SiSupplierList, 'name'>>,
) {
  return supabase
    .from('si_supplier_lists')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', listId)
    .select()
    .single();
}

export async function deleteSupplierList(supabase: SupabaseClient, listId: string) {
  return supabase.from('si_supplier_lists').delete().eq('id', listId);
}

// ─── Suppliers ─────────────────────────────────────────────────────────────

export async function listSuppliersByList(supabase: SupabaseClient, listId: string) {
  return supabase
    .from('si_suppliers')
    .select('*, analyses:si_supplier_analyses(*)')
    .eq('list_id', listId)
    .order('created_at', { ascending: false });
}

export async function getSupplier(supabase: SupabaseClient, supplierId: string) {
  return supabase
    .from('si_suppliers')
    .select('*, analyses:si_supplier_analyses(*), outreach_events:si_outreach_events(*)')
    .eq('id', supplierId)
    .maybeSingle();
}

export async function createSupplier(
  supabase: SupabaseClient,
  listId: string,
  data: { company_name: string; website?: string | null; notes?: string | null },
) {
  const id = createId();
  return supabase
    .from('si_suppliers')
    .insert({
      id,
      list_id: listId,
      company_name: data.company_name,
      website: data.website ?? null,
      notes: data.notes ?? null,
    })
    .select()
    .single();
}

export async function updateSupplier(
  supabase: SupabaseClient,
  supplierId: string,
  patch: Partial<SiSupplier>,
) {
  return supabase
    .from('si_suppliers')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', supplierId)
    .select()
    .single();
}

// ─── Dashboard stats (aggregates) ──────────────────────────────────────────

export async function getDashboardStats(supabase: SupabaseClient, userId: string) {
  // Total suppliers (via joined lists via RLS)
  const totalQ = supabase
    .from('si_suppliers')
    .select('id', { count: 'exact', head: true });

  // Strong candidates — latest analysis recommendation = STRONG_CANDIDATE
  // (computed in app layer from latest analyses per supplier)
  const analysesQ = supabase
    .from('si_supplier_analyses')
    .select('supplier_id, recommendation, analyzed_at')
    .order('analyzed_at', { ascending: false })
    .limit(500);

  // Next-action items
  const needsActionQ = supabase
    .from('si_suppliers')
    .select('id', { count: 'exact', head: true })
    .not('next_action_date', 'is', null)
    .lte('next_action_date', new Date().toISOString());

  const [total, analyses, needsAction] = await Promise.all([totalQ, analysesQ, needsActionQ]);

  // Compute "strong" by deduping to latest-per-supplier then counting STRONG_CANDIDATE
  const latestBySupplier = new Map<string, string>();
  for (const row of analyses.data ?? []) {
    if (!latestBySupplier.has(row.supplier_id)) {
      latestBySupplier.set(row.supplier_id, row.recommendation);
    }
  }
  let strong = 0;
  let highRisk = 0;
  for (const rec of latestBySupplier.values()) {
    if (rec === 'STRONG_CANDIDATE') strong++;
    else if (rec === 'HIGH_RISK') highRisk++;
  }

  return {
    userId,
    totalSuppliers: total.count ?? 0,
    strongCandidates: strong,
    highRiskCount: highRisk,
    needsActionQueue: needsAction.count ?? 0,
  };
}

// ─── Outreach events ───────────────────────────────────────────────────────

export async function logOutreachEvent(
  supabase: SupabaseClient,
  input: {
    supplier_id: string;
    type: OutreachEventType;
    subject?: string | null;
    body?: string | null;
    outcome?: string | null;
    note?: string | null;
    logged_by: string;
    sequence_step: number;
  },
) {
  const id = createId();
  return supabase.rpc('si_log_outreach_event', {
    p_id: id,
    p_supplier_id: input.supplier_id,
    p_type: input.type,
    p_subject: input.subject ?? null,
    p_body: input.body ?? null,
    p_outcome: input.outcome ?? null,
    p_note: input.note ?? null,
    p_logged_by: input.logged_by,
    p_sequence_step: input.sequence_step,
  });
}

// ─── Discovery ─────────────────────────────────────────────────────────────

export async function listDiscoverySearches(supabase: SupabaseClient, userId: string) {
  return supabase
    .from('si_discovery_searches')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
}

export async function getDiscoverySearch(supabase: SupabaseClient, searchId: string) {
  return supabase
    .from('si_discovery_searches')
    .select('*, candidates:si_discovery_candidates(*)')
    .eq('id', searchId)
    .maybeSingle();
}

export async function insertDiscoveryWithCandidates(
  supabase: SupabaseClient,
  search: Record<string, unknown>,
  candidates: Record<string, unknown>[],
) {
  return supabase.rpc('si_insert_discovery_with_candidates', {
    p_search: search,
    p_candidates: candidates,
  });
}

// ─── Follow-ups ────────────────────────────────────────────────────────────

export async function getFollowUpQueue(
  supabase: SupabaseClient,
  opts: {
    tier?: 'TIER_1' | 'TIER_2' | 'TIER_3';
    priority?: 'HIGH' | 'MEDIUM' | 'LOW';
    assignedTo?: string;
  } = {},
) {
  let q = supabase
    .from('si_follow_ups')
    .select('*, supplier:si_suppliers(*)')
    .order('next_follow_up_date', { ascending: true, nullsFirst: false });
  if (opts.tier) q = q.eq('tier', opts.tier);
  if (opts.priority) q = q.eq('priority', opts.priority);
  if (opts.assignedTo) q = q.eq('assigned_to', opts.assignedTo);
  return q;
}

export async function logFollowUpAction(
  supabase: SupabaseClient,
  input: {
    follow_up_id: string;
    action: string;
    detail?: string | null;
    performed_by?: string | null;
  },
) {
  const id = createId();
  return supabase.rpc('si_log_follow_up_action', {
    p_id: id,
    p_follow_up_id: input.follow_up_id,
    p_action: input.action,
    p_detail: input.detail ?? null,
    p_performed_by: input.performed_by ?? null,
  });
}

// ─── Email templates ───────────────────────────────────────────────────────

export async function listEmailTemplates(supabase: SupabaseClient) {
  return supabase.from('si_email_templates').select('*').order('sequence_step');
}

// ─── Analysis jobs (used if sync analyze is infeasible) ────────────────────

export async function createAnalysisJob(supabase: SupabaseClient, supplierId: string) {
  const id = createId();
  return supabase
    .from('si_analysis_jobs')
    .insert({ id, supplier_id: supplierId, status: 'queued' })
    .select()
    .single();
}

export async function getAnalysisJob(supabase: SupabaseClient, jobId: string) {
  return supabase.from('si_analysis_jobs').select('*').eq('id', jobId).maybeSingle();
}

export async function getLatestAnalysisJobForSupplier(
  supabase: SupabaseClient,
  supplierId: string,
) {
  return supabase
    .from('si_analysis_jobs')
    .select('*')
    .eq('supplier_id', supplierId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
}
