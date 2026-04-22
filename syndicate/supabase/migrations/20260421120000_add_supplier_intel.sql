-- ============================================================================
-- Migration: add_supplier_intel
-- Description:
--   Ports Supplier Intel's Prisma schema into Syndicate's Supabase database.
--   11 tables, 15 enums, 4 RPC functions for the Prisma $transaction sites,
--   plus a si_analysis_jobs table to support async job-and-poll (used if
--   Railway kills synchronous analyze requests; harmless if unused).
--
--   All tables prefixed with si_ to avoid collision with Syndicate's own
--   tables. RLS enabled on everything. User ownership flows through
--   si_supplier_lists.user_id and si_discovery_searches.user_id, which
--   reference Syndicate's public.users(user_id). Child tables (suppliers,
--   analyses, outreach events, candidates, follow-ups, follow-up activities)
--   inherit access via EXISTS on their parent row.
--
--   IDs are TEXT (cuid-shape, generated client-side via @paralleldrive/cuid2)
--   to preserve Supplier Intel's ID format. user_id columns are UUID to
--   match Syndicate's public.users.user_id.
-- ============================================================================


-- ============================================================================
-- ENUMS
-- ============================================================================
CREATE TYPE si_supplier_status        AS ENUM ('PENDING','ANALYZING','DONE','FAILED');
CREATE TYPE si_workflow_status        AS ENUM ('REVIEW','HIGH_PRIORITY','CONTACTED','FOLLOW_UP','RESPONDED','APPROVED','REJECTED');
CREATE TYPE si_outreach_status        AS ENUM ('NOT_CONTACTED','READY_TO_CONTACT','CONTACTED','FOLLOW_UP_DUE','REPLIED','NO_RESPONSE','APPROVED','REJECTED');
CREATE TYPE si_next_action_type       AS ENUM ('SEND_FIRST_EMAIL','FOLLOW_UP','CALL','REVIEW_REPLY','PREP_APPLICATION','WAIT');
CREATE TYPE si_classification         AS ENUM ('BRAND','DISTRIBUTOR','WHOLESALER','RETAILER','LIQUIDATOR','MARKETPLACE_SELLER','UNCLEAR');
CREATE TYPE si_confidence             AS ENUM ('LOW','MEDIUM','HIGH');
CREATE TYPE si_priority_level         AS ENUM ('LOW','MEDIUM','HIGH');
CREATE TYPE si_recommendation         AS ENUM ('STRONG_CANDIDATE','NEEDS_REVIEW','HIGH_RISK');
CREATE TYPE si_outreach_event_type    AS ENUM ('EMAIL_DRAFTED','EMAIL_LOGGED','FOLLOW_UP_LOGGED','CALL_LOGGED','REPLY_LOGGED','NOTE');
CREATE TYPE si_discovery_status       AS ENUM ('PENDING','RUNNING','DONE','FAILED');
CREATE TYPE si_authorization_level    AS ENUM ('STRONG','MODERATE','WEAK','NONE');
CREATE TYPE si_follow_up_tier         AS ENUM ('TIER_1','TIER_2','TIER_3');
CREATE TYPE si_follow_up_priority     AS ENUM ('HIGH','MEDIUM','LOW');
CREATE TYPE si_contact_method         AS ENUM ('EMAIL','PHONE','FORM');
CREATE TYPE si_job_status             AS ENUM ('queued','running','completed','failed');


-- ============================================================================
-- TABLES
-- ============================================================================

-- 1. Supplier lists (user-owned)
CREATE TABLE public.si_supplier_lists (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    user_id    UUID REFERENCES public.users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX si_supplier_lists_user_id_idx ON public.si_supplier_lists(user_id);

-- 2. Suppliers (belongs to a list)
CREATE TABLE public.si_suppliers (
    id                  TEXT PRIMARY KEY,
    list_id             TEXT NOT NULL REFERENCES public.si_supplier_lists(id) ON DELETE CASCADE,
    company_name        TEXT NOT NULL,
    website             TEXT,
    notes               TEXT,
    status              si_supplier_status NOT NULL DEFAULT 'PENDING',
    workflow_status     si_workflow_status NOT NULL DEFAULT 'REVIEW',
    rejection_reason    TEXT,
    outreach_status     si_outreach_status NOT NULL DEFAULT 'NOT_CONTACTED',
    next_action_type    si_next_action_type,
    next_action_date    TIMESTAMPTZ,
    next_action_note    TEXT,
    last_contact_at     TIMESTAMPTZ,
    outreach_started_at TIMESTAMPTZ,
    sequence_step       INTEGER NOT NULL DEFAULT 0,
    last_action_at      TIMESTAMPTZ,
    last_action_by      TEXT,
    outreach_priority   TEXT NOT NULL DEFAULT 'MEDIUM',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX si_suppliers_list_id_idx            ON public.si_suppliers(list_id);
CREATE INDEX si_suppliers_status_idx             ON public.si_suppliers(status);
CREATE INDEX si_suppliers_workflow_status_idx    ON public.si_suppliers(workflow_status);
CREATE INDEX si_suppliers_outreach_status_idx    ON public.si_suppliers(outreach_status);
CREATE INDEX si_suppliers_next_action_date_idx   ON public.si_suppliers(next_action_date);

-- 3. Supplier analyses (one per analysis run; UI shows latest)
CREATE TABLE public.si_supplier_analyses (
    id                          TEXT PRIMARY KEY,
    supplier_id                 TEXT NOT NULL REFERENCES public.si_suppliers(id) ON DELETE CASCADE,
    classification              si_classification NOT NULL,
    confidence_level            si_confidence NOT NULL,
    supplier_quality_score      INTEGER NOT NULL DEFAULT 1,
    amazon_fit_score            INTEGER NOT NULL DEFAULT 1,
    priority_level              si_priority_level NOT NULL DEFAULT 'LOW',
    score                       INTEGER NOT NULL,
    legitimacy_score            INTEGER NOT NULL,
    wholesale_structure_score   INTEGER NOT NULL,
    supply_chain_doc_score      INTEGER NOT NULL,
    amazon_wholesale_fit_score  INTEGER NOT NULL,
    red_flag_penalty            INTEGER NOT NULL,
    recommendation              si_recommendation NOT NULL,
    score_breakdown             JSONB NOT NULL,
    green_flags                 JSONB NOT NULL,
    red_flags                   JSONB NOT NULL,
    reasoning_summary           TEXT NOT NULL,
    extracted_signals           JSONB NOT NULL,
    scrape_diagnostics          JSONB NOT NULL,
    raw_llm_response            JSONB,
    analyzed_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX si_supplier_analyses_supplier_id_idx ON public.si_supplier_analyses(supplier_id);
CREATE INDEX si_supplier_analyses_analyzed_at_idx ON public.si_supplier_analyses(analyzed_at);

-- 4. Outreach events (logged per supplier)
CREATE TABLE public.si_outreach_events (
    id            TEXT PRIMARY KEY,
    supplier_id   TEXT NOT NULL REFERENCES public.si_suppliers(id) ON DELETE CASCADE,
    type          si_outreach_event_type NOT NULL,
    subject       TEXT,
    body          TEXT,
    outcome       TEXT,
    note          TEXT,
    logged_by     TEXT NOT NULL DEFAULT 'VA',
    sequence_step INTEGER NOT NULL DEFAULT 1,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX si_outreach_events_supplier_id_idx ON public.si_outreach_events(supplier_id);
CREATE INDEX si_outreach_events_created_at_idx  ON public.si_outreach_events(created_at);

-- 5. Email templates (shared across users)
CREATE TABLE public.si_email_templates (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    subject       TEXT NOT NULL,
    body          TEXT NOT NULL,
    sequence_step INTEGER NOT NULL,
    priority      TEXT NOT NULL DEFAULT 'ALL',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Discovery searches (user-owned)
CREATE TABLE public.si_discovery_searches (
    id                 TEXT PRIMARY KEY,
    user_id            UUID REFERENCES public.users(user_id) ON DELETE SET NULL,
    brand              TEXT,
    category           TEXT,
    location           TEXT,
    supplier_type      TEXT NOT NULL DEFAULT 'all',
    must_have_signals  TEXT[] NOT NULL DEFAULT '{}',
    exclude_filters    TEXT[] NOT NULL DEFAULT '{}',
    status             si_discovery_status NOT NULL DEFAULT 'PENDING',
    error              TEXT,
    total_found        INTEGER NOT NULL DEFAULT 0,
    diagnostics        JSONB,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at       TIMESTAMPTZ
);
CREATE INDEX si_discovery_searches_user_id_idx ON public.si_discovery_searches(user_id);

-- 7. Discovery candidates (results of a search, may link to a supplier once added)
CREATE TABLE public.si_discovery_candidates (
    id                      TEXT PRIMARY KEY,
    search_id               TEXT NOT NULL REFERENCES public.si_discovery_searches(id) ON DELETE CASCADE,
    company_name            TEXT NOT NULL,
    website                 TEXT,
    location                TEXT,
    estimated_type          TEXT,
    authorization_level     si_authorization_level NOT NULL DEFAULT 'NONE',
    authorization_evidence  TEXT[] NOT NULL DEFAULT '{}',
    authorization_reasoning TEXT,
    source_context          TEXT,
    source_angles           TEXT[] NOT NULL DEFAULT '{}',
    source_angle_count      INTEGER NOT NULL DEFAULT 1,
    relevance_score         DOUBLE PRECISION NOT NULL DEFAULT 0,
    confidence_score        INTEGER NOT NULL DEFAULT 5,
    rank_position           INTEGER NOT NULL DEFAULT 0,
    supplier_id             TEXT REFERENCES public.si_suppliers(id) ON DELETE SET NULL,
    added_to_list_at        TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX si_discovery_candidates_search_id_idx   ON public.si_discovery_candidates(search_id);
CREATE INDEX si_discovery_candidates_supplier_id_idx ON public.si_discovery_candidates(supplier_id);

-- 8. CSV imports (audit log for bulk uploads)
CREATE TABLE public.si_csv_imports (
    id         TEXT PRIMARY KEY,
    list_id    TEXT NOT NULL,
    filename   TEXT NOT NULL,
    row_count  INTEGER NOT NULL,
    imported   INTEGER NOT NULL,
    status     TEXT NOT NULL DEFAULT 'COMPLETED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Follow-ups (outreach pipeline)
CREATE TABLE public.si_follow_ups (
    id                   TEXT PRIMARY KEY,
    supplier_id          TEXT NOT NULL REFERENCES public.si_suppliers(id) ON DELETE CASCADE,
    tier                 si_follow_up_tier NOT NULL DEFAULT 'TIER_2',
    priority             si_follow_up_priority NOT NULL DEFAULT 'MEDIUM',
    assigned_to          TEXT,
    notes                TEXT,
    next_follow_up_date  TIMESTAMPTZ,
    last_contacted_at    TIMESTAMPTZ,
    contact_method       si_contact_method,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX si_follow_ups_supplier_id_idx         ON public.si_follow_ups(supplier_id);
CREATE INDEX si_follow_ups_assigned_to_idx         ON public.si_follow_ups(assigned_to);
CREATE INDEX si_follow_ups_next_follow_up_date_idx ON public.si_follow_ups(next_follow_up_date);

-- 10. Follow-up activities (log per follow-up)
CREATE TABLE public.si_follow_up_activities (
    id           TEXT PRIMARY KEY,
    follow_up_id TEXT NOT NULL REFERENCES public.si_follow_ups(id) ON DELETE CASCADE,
    action       TEXT NOT NULL,
    detail       TEXT,
    performed_by TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX si_follow_up_activities_follow_up_id_idx ON public.si_follow_up_activities(follow_up_id);
CREATE INDEX si_follow_up_activities_created_at_idx   ON public.si_follow_up_activities(created_at);

-- 11. Analysis jobs (used if sync analyze is infeasible; harmless if unused)
CREATE TABLE public.si_analysis_jobs (
    id           TEXT PRIMARY KEY,
    supplier_id  TEXT NOT NULL REFERENCES public.si_suppliers(id) ON DELETE CASCADE,
    status       si_job_status NOT NULL DEFAULT 'queued',
    error        TEXT,
    started_at   TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX si_analysis_jobs_status_idx      ON public.si_analysis_jobs(status);
CREATE INDEX si_analysis_jobs_supplier_id_idx ON public.si_analysis_jobs(supplier_id);


-- ============================================================================
-- RLS
-- ============================================================================
ALTER TABLE public.si_supplier_lists       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.si_suppliers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.si_supplier_analyses    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.si_outreach_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.si_email_templates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.si_discovery_searches   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.si_discovery_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.si_csv_imports          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.si_follow_ups           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.si_follow_up_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.si_analysis_jobs        ENABLE ROW LEVEL SECURITY;

-- Owner-scoped tables
CREATE POLICY si_supplier_lists_owner_all
  ON public.si_supplier_lists FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY si_discovery_searches_owner_all
  ON public.si_discovery_searches FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Child tables: access through si_supplier_lists.user_id
CREATE POLICY si_suppliers_owner_via_list
  ON public.si_suppliers FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.si_supplier_lists l WHERE l.id = si_suppliers.list_id AND l.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.si_supplier_lists l WHERE l.id = si_suppliers.list_id AND l.user_id = auth.uid()));

CREATE POLICY si_supplier_analyses_owner_via_supplier
  ON public.si_supplier_analyses FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.si_suppliers s
    JOIN public.si_supplier_lists l ON l.id = s.list_id
    WHERE s.id = si_supplier_analyses.supplier_id AND l.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.si_suppliers s
    JOIN public.si_supplier_lists l ON l.id = s.list_id
    WHERE s.id = si_supplier_analyses.supplier_id AND l.user_id = auth.uid()
  ));

CREATE POLICY si_outreach_events_owner_via_supplier
  ON public.si_outreach_events FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.si_suppliers s
    JOIN public.si_supplier_lists l ON l.id = s.list_id
    WHERE s.id = si_outreach_events.supplier_id AND l.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.si_suppliers s
    JOIN public.si_supplier_lists l ON l.id = s.list_id
    WHERE s.id = si_outreach_events.supplier_id AND l.user_id = auth.uid()
  ));

CREATE POLICY si_discovery_candidates_owner_via_search
  ON public.si_discovery_candidates FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.si_discovery_searches s WHERE s.id = si_discovery_candidates.search_id AND s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.si_discovery_searches s WHERE s.id = si_discovery_candidates.search_id AND s.user_id = auth.uid()));

CREATE POLICY si_follow_ups_owner_via_supplier
  ON public.si_follow_ups FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.si_suppliers s
    JOIN public.si_supplier_lists l ON l.id = s.list_id
    WHERE s.id = si_follow_ups.supplier_id AND l.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.si_suppliers s
    JOIN public.si_supplier_lists l ON l.id = s.list_id
    WHERE s.id = si_follow_ups.supplier_id AND l.user_id = auth.uid()
  ));

CREATE POLICY si_follow_up_activities_owner_via_followup
  ON public.si_follow_up_activities FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.si_follow_ups f
    JOIN public.si_suppliers s ON s.id = f.supplier_id
    JOIN public.si_supplier_lists l ON l.id = s.list_id
    WHERE f.id = si_follow_up_activities.follow_up_id AND l.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.si_follow_ups f
    JOIN public.si_suppliers s ON s.id = f.supplier_id
    JOIN public.si_supplier_lists l ON l.id = s.list_id
    WHERE f.id = si_follow_up_activities.follow_up_id AND l.user_id = auth.uid()
  ));

CREATE POLICY si_analysis_jobs_owner_via_supplier
  ON public.si_analysis_jobs FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.si_suppliers s
    JOIN public.si_supplier_lists l ON l.id = s.list_id
    WHERE s.id = si_analysis_jobs.supplier_id AND l.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.si_suppliers s
    JOIN public.si_supplier_lists l ON l.id = s.list_id
    WHERE s.id = si_analysis_jobs.supplier_id AND l.user_id = auth.uid()
  ));

-- csv_imports has no user_id and no FK to a user-owned table; gate by list ownership.
CREATE POLICY si_csv_imports_owner_via_list
  ON public.si_csv_imports FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.si_supplier_lists l WHERE l.id = si_csv_imports.list_id AND l.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.si_supplier_lists l WHERE l.id = si_csv_imports.list_id AND l.user_id = auth.uid()));

-- Email templates: shared across all authenticated users (matches source schema)
CREATE POLICY si_email_templates_auth_all
  ON public.si_email_templates FOR ALL TO authenticated
  USING (TRUE) WITH CHECK (TRUE);


-- ============================================================================
-- GRANTS
-- ============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.si_supplier_lists,
  public.si_suppliers,
  public.si_supplier_analyses,
  public.si_outreach_events,
  public.si_email_templates,
  public.si_discovery_searches,
  public.si_discovery_candidates,
  public.si_csv_imports,
  public.si_follow_ups,
  public.si_follow_up_activities,
  public.si_analysis_jobs
TO authenticated, service_role;


-- ============================================================================
-- RPC: si_log_outreach_event
--   Atomic equivalent of Prisma $transaction in suppliers/[id]/outreach/route.ts.
--   Appends an outreach event row, bumps the supplier's sequence_step +
--   last_action_at + last_action_by + last_contact_at, and advances
--   workflow_status to CONTACTED on first contact.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.si_log_outreach_event(
  p_id             TEXT,
  p_supplier_id    TEXT,
  p_type           si_outreach_event_type,
  p_subject        TEXT,
  p_body           TEXT,
  p_outcome        TEXT,
  p_note           TEXT,
  p_logged_by      TEXT,
  p_sequence_step  INTEGER
) RETURNS public.si_outreach_events
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_event public.si_outreach_events;
BEGIN
  INSERT INTO public.si_outreach_events (
    id, supplier_id, type, subject, body, outcome, note, logged_by, sequence_step
  ) VALUES (
    p_id, p_supplier_id, p_type, p_subject, p_body, p_outcome, p_note, p_logged_by, p_sequence_step
  ) RETURNING * INTO v_event;

  UPDATE public.si_suppliers
  SET sequence_step  = GREATEST(sequence_step, p_sequence_step),
      last_action_at = NOW(),
      last_action_by = p_logged_by,
      last_contact_at = CASE
        WHEN p_type IN ('EMAIL_LOGGED','CALL_LOGGED','FOLLOW_UP_LOGGED')
        THEN NOW() ELSE last_contact_at
      END,
      outreach_status = CASE
        WHEN outreach_status = 'NOT_CONTACTED'
         AND p_type IN ('EMAIL_LOGGED','CALL_LOGGED') THEN 'CONTACTED'::si_outreach_status
        ELSE outreach_status
      END,
      workflow_status = CASE
        WHEN workflow_status IN ('REVIEW','HIGH_PRIORITY')
         AND p_type IN ('EMAIL_LOGGED','CALL_LOGGED') THEN 'CONTACTED'::si_workflow_status
        ELSE workflow_status
      END,
      outreach_started_at = COALESCE(outreach_started_at, NOW()),
      updated_at = NOW()
  WHERE id = p_supplier_id;

  RETURN v_event;
END;
$$;
GRANT EXECUTE ON FUNCTION public.si_log_outreach_event(TEXT, TEXT, si_outreach_event_type, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER) TO authenticated;


-- ============================================================================
-- RPC: si_log_follow_up_action
--   Atomic equivalent of Prisma $transaction in follow-up/action/route.ts.
--   Appends an activity row and bumps the follow-up's last_contacted_at
--   and updated_at.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.si_log_follow_up_action(
  p_id            TEXT,
  p_follow_up_id  TEXT,
  p_action        TEXT,
  p_detail        TEXT,
  p_performed_by  TEXT
) RETURNS public.si_follow_up_activities
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_activity public.si_follow_up_activities;
BEGIN
  INSERT INTO public.si_follow_up_activities (
    id, follow_up_id, action, detail, performed_by
  ) VALUES (
    p_id, p_follow_up_id, p_action, p_detail, p_performed_by
  ) RETURNING * INTO v_activity;

  UPDATE public.si_follow_ups
  SET last_contacted_at = CASE
        WHEN p_action IN ('EMAIL_SENT','CALL_MADE','FOLLOW_UP') THEN NOW()
        ELSE last_contacted_at
      END,
      updated_at = NOW()
  WHERE id = p_follow_up_id;

  RETURN v_activity;
END;
$$;
GRANT EXECUTE ON FUNCTION public.si_log_follow_up_action(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;


-- ============================================================================
-- RPC: si_insert_discovery_with_candidates
--   Atomic equivalent of Prisma $transaction in discovery/route.ts.
--   Inserts a discovery search + all its candidate rows in a single txn.
--   Candidates are passed as JSONB array; each element must match the
--   si_discovery_candidates shape (less id/search_id — those come from args).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.si_insert_discovery_with_candidates(
  p_search JSONB,
  p_candidates JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_search_id TEXT;
  v_candidate JSONB;
  v_inserted_count INTEGER := 0;
BEGIN
  v_search_id := p_search->>'id';

  INSERT INTO public.si_discovery_searches (
    id, user_id, brand, category, location, supplier_type,
    must_have_signals, exclude_filters, status, error, total_found,
    diagnostics, created_at, completed_at
  ) VALUES (
    v_search_id,
    NULLIF(p_search->>'user_id','')::UUID,
    p_search->>'brand',
    p_search->>'category',
    p_search->>'location',
    COALESCE(p_search->>'supplier_type','all'),
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_search->'must_have_signals')), '{}'::TEXT[]),
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_search->'exclude_filters')), '{}'::TEXT[]),
    COALESCE((p_search->>'status')::si_discovery_status, 'PENDING'::si_discovery_status),
    p_search->>'error',
    COALESCE((p_search->>'total_found')::INTEGER, 0),
    p_search->'diagnostics',
    COALESCE((p_search->>'created_at')::TIMESTAMPTZ, NOW()),
    NULLIF(p_search->>'completed_at','')::TIMESTAMPTZ
  );

  FOR v_candidate IN SELECT * FROM jsonb_array_elements(p_candidates) LOOP
    INSERT INTO public.si_discovery_candidates (
      id, search_id, company_name, website, location, estimated_type,
      authorization_level, authorization_evidence, authorization_reasoning,
      source_context, source_angles, source_angle_count,
      relevance_score, confidence_score, rank_position
    ) VALUES (
      v_candidate->>'id',
      v_search_id,
      v_candidate->>'company_name',
      v_candidate->>'website',
      v_candidate->>'location',
      v_candidate->>'estimated_type',
      COALESCE((v_candidate->>'authorization_level')::si_authorization_level, 'NONE'::si_authorization_level),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(v_candidate->'authorization_evidence')), '{}'::TEXT[]),
      v_candidate->>'authorization_reasoning',
      v_candidate->>'source_context',
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(v_candidate->'source_angles')), '{}'::TEXT[]),
      COALESCE((v_candidate->>'source_angle_count')::INTEGER, 1),
      COALESCE((v_candidate->>'relevance_score')::DOUBLE PRECISION, 0),
      COALESCE((v_candidate->>'confidence_score')::INTEGER, 5),
      COALESCE((v_candidate->>'rank_position')::INTEGER, 0)
    );
    v_inserted_count := v_inserted_count + 1;
  END LOOP;

  RETURN jsonb_build_object('search_id', v_search_id, 'candidate_count', v_inserted_count);
END;
$$;
GRANT EXECUTE ON FUNCTION public.si_insert_discovery_with_candidates(JSONB, JSONB) TO authenticated;


-- ============================================================================
-- RPC: si_bulk_insert_suppliers
--   Atomic bulk-create for suppliers (CSV upload path). Takes a list_id
--   and a JSONB array of supplier shapes; inserts all in one txn.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.si_bulk_insert_suppliers(
  p_list_id TEXT,
  p_suppliers JSONB
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_supplier JSONB;
  v_count INTEGER := 0;
BEGIN
  FOR v_supplier IN SELECT * FROM jsonb_array_elements(p_suppliers) LOOP
    INSERT INTO public.si_suppliers (
      id, list_id, company_name, website, notes
    ) VALUES (
      v_supplier->>'id',
      p_list_id,
      v_supplier->>'company_name',
      v_supplier->>'website',
      v_supplier->>'notes'
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.si_bulk_insert_suppliers(TEXT, JSONB) TO authenticated;


-- ============================================================================
-- Schema cache reload
-- ============================================================================
NOTIFY pgrst, 'reload schema';
