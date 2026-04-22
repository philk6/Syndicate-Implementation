# Supplier Intel — Port Plan

**Status:** proposal, not yet approved
**Target repo:** `philk6/Syndicate-Implementation` (this repo)
**Source repo:** `github.com/philk6/Supplier-Intel` (read-only; survey clone only)
**Estimated effort:** 23–46 hours, **LARGE** — a week+ project, best executed in 3-4 focused sessions
**Deployment context:** Syndicate is pre-launch with zero users; we can break Syndicate freely during the port. The live Supplier Intel deployment at `supplier-intel-production.up.railway.app` keeps running untouched until Commit 6.

---

## Phase 1 — Inventory of the Supplier Intel repo

### 1.1 Framework and versions

| Item | Value |
|---|---|
| Next.js | `^14.2.35` (App Router) |
| React | `^18` |
| TypeScript | `^5` |
| Node engines | `>=20.0.0` |
| Tailwind | `^3.4.1` |
| Radix UI | `@radix-ui/react-separator`, `@radix-ui/react-slot` only (much lighter than Syndicate's set) |
| Icons | `lucide-react ^0.447.0` |

**Compatibility with Syndicate:** ✅ Same Next.js major, same React major, same Node, same Tailwind major. No framework conflicts.

### 1.2 Auth library

| Item | Value |
|---|---|
| Package | `next-auth ^4.24.13` (credentials provider, JWT strategy) |
| Config file | `app/api/auth/[...nextauth]/route.ts` |
| Password hashing | `bcryptjs ^2.4.3` (custom — NextAuth stores hashed passwords in Prisma `User.hashedPassword`) |
| Register flow | `app/api/auth/register/route.ts` (invite-code gated) |
| Admin-generated invite codes | `app/api/admin/invite-codes/route.ts` + `InviteCode` Prisma model |
| OAuth providers | **None** — credentials only |
| Magic links | **None** |
| Email sending | **None** — no password-reset email, no verification email |

**Auth call sites that need rewriting:** 14 across `getServerSession` / `useSession` / `signIn` / `signOut`.

**Migration path:** NextAuth → `@supabase/ssr` (what Syndicate already uses). Credentials provider + `User.hashedPassword` + invite codes all get deleted; Syndicate's existing Supabase auth replaces all of it. Every protected page/API route currently uses `getServerSession(authOptions)` → becomes `supabase.auth.getUser()` from our server-client helper.

### 1.3 Database layer

| Item | Value |
|---|---|
| ORM | Prisma `^6.19.3` (client + generator) |
| Schema file | `prisma/schema.prisma` |
| Provider | `postgresql` pointed at `DATABASE_URL` (pooled) + `DIRECT_URL` (direct) |
| Migration tool | Prisma Migrate (`npx prisma migrate deploy` in build) |
| Seed | `prisma/seed.ts` via `tsx` |

**Prisma call sites:** 104 CRUD calls + 5 `$transaction` wrappers + 20+ `$executeRawUnsafe` lines in the admin `setup-db` route (those are one-shot migration patches — port target is the actual schema, not these patches).

### 1.4 Database provider

Supabase Postgres (same provider as Syndicate; separate project). The env convention (pooled `DATABASE_URL` + direct `DIRECT_URL`) is Supabase's standard Prisma pattern.

### 1.5 Full list of routes

**Pages (12):**

| Route | File | Purpose |
|---|---|---|
| `/` | `app/page.tsx` | Redirect shell |
| `/login` | `app/login/page.tsx` | NextAuth credentials login — **will be neutered** |
| `/register` | `app/register/page.tsx` | Invite-code-gated signup — **will be neutered** |
| `/dashboard` | `app/(dashboard)/dashboard/page.tsx` | Mission-control stats, priority queue, recent activity |
| `/lists` | `app/(dashboard)/lists/page.tsx` | Supplier list index |
| `/lists/[listId]` | `app/(dashboard)/lists/[listId]/page.tsx` | Single list with its suppliers |
| `/discovery` | `app/(dashboard)/discovery/page.tsx` | AI-powered multi-angle supplier search |
| `/suppliers/[supplierId]` | `app/(dashboard)/suppliers/[supplierId]/page.tsx` | Supplier detail with analysis, scoring, outreach |
| `/follow-up` | `app/(dashboard)/follow-up/page.tsx` | Follow-up queue with tier/priority filters |
| `/follow-up/templates` | `app/(dashboard)/follow-up/templates/page.tsx` | Outreach email template management |
| `/admin` | `app/(dashboard)/admin/page.tsx` | Admin controls (invite codes, rescore) — **most gating removed** |
| `/settings` | `app/(dashboard)/settings/page.tsx` | User settings |

**API routes (21):**

| Route | Method(s) | Purpose |
|---|---|---|
| `/api/auth/[...nextauth]` | GET, POST | NextAuth handler — **deleted** |
| `/api/auth/register` | POST | Invite-code registration — **deleted** |
| `/api/auth/setup` | POST | Initial DB setup — **deleted** (Supabase migrations replace it) |
| `/api/admin/setup-db` | POST | Prisma-specific schema-patching endpoint — **deleted** |
| `/api/admin/invite-codes` | POST, GET | Create/list invite codes — **deleted** (no invite codes post-port) |
| `/api/admin/rescore` | POST | Bulk re-score suppliers via Claude |
| `/api/analyze/[supplierId]` | POST | Full analysis pipeline (scrape → Claude → persist) |
| `/api/analyze/debug` | POST | Debug endpoint for analysis pipeline |
| `/api/chat` | POST | Claude chat assistant widget |
| `/api/discovery` | POST, GET | Run new discovery / list saved searches |
| `/api/discovery/[searchId]` | GET, DELETE | Fetch / delete one discovery search |
| `/api/discovery/[searchId]/add` | POST | Move a candidate into a supplier list |
| `/api/suppliers` | GET, POST | List / bulk-create suppliers |
| `/api/suppliers/[supplierId]` | GET, PUT | Fetch / update supplier |
| `/api/suppliers/[supplierId]/outreach` | POST | Log outreach activity |
| `/api/suppliers/[supplierId]/workflow-status` | POST | Update workflow status |
| `/api/lists` | GET, POST | List / create supplier lists |
| `/api/lists/[listId]` | GET, PUT, DELETE | CRUD on a single list |
| `/api/follow-up/queue` | GET, PATCH | Get / update follow-up queue |
| `/api/follow-up/action` | POST | Log a follow-up action (uses `$transaction`) |
| `/api/follow-up/templates` | GET, POST | Email template CRUD |

### 1.6 External API integrations

| Service | Package | Env vars | Usage |
|---|---|---|---|
| Anthropic Claude | `@anthropic-ai/sdk ^0.27.0` | `ANTHROPIC_API_KEY` | Supplier scoring, discovery generation, chat widget, re-scoring admin action |
| OpenAI | `openai ^4.104.0` | Implicitly `OPENAI_API_KEY` (not referenced in survey — may be dead code) | Secondary classification/scoring |
| Web scraping | `cheerio ^1.0.0` | none | Fetches & parses supplier websites during analysis |
| CSV parsing | `papaparse ^5.4.1` | none | Bulk supplier list imports |

No Keepa, no Jungle Scout, no Amazon SP-API. Claude is doing the heavy lifting via direct web scraping.

### 1.7 File upload / storage

**None.** The tool does not upload files to S3/Supabase Storage/local filesystem. Supplier lists are CSV-uploaded but parsed in-memory via `papaparse`, not stored. No storage-migration work needed.

### 1.8 Background jobs / crons / queues

**None.** No Vercel cron, no scheduled tasks, no worker process. The `/api/analyze/[supplierId]` endpoint runs synchronously on HTTP request (scrape + Claude call take ~30-90 seconds; the client polls). No queue infrastructure to port.

### 1.9 Env var inventory

| Var | Group | Post-port action |
|---|---|---|
| `NEXTAUTH_SECRET` | auth | **Drop** — replaced by Supabase session cookies |
| `DATABASE_URL` | database | **Drop** — Syndicate's Supabase tables absorb Supplier Intel's |
| `DIRECT_URL` | database | **Drop** |
| `ANTHROPIC_API_KEY` | third-party | **Add to Syndicate's Railway service** |
| `OPENAI_API_KEY` | third-party | **Add to Syndicate's Railway service** (if actually used; verify) |
| `NODE_ENV` | other | Railway sets automatically |

### 1.10 Package.json deps (new additions to Syndicate)

| Package | Version | Notes |
|---|---|---|
| `@anthropic-ai/sdk` | `^0.27.0` | **Add** (not in Syndicate) |
| `openai` | `^4.104.0` | **Add** (not in Syndicate; confirm it's used before adding) |
| `cheerio` | `^1.0.0` | **Add** (not in Syndicate) |
| `papaparse` | `^5.4.1` | **Add** (not in Syndicate — Syndicate uses `xlsx` for imports; `papaparse` is CSV-specific) |
| `@types/papaparse` | `^5.3.14` | **Add (dev)** |
| `bcryptjs` | `^2.4.3` | **Already present** in Syndicate — no action |
| `next` | `^14.2.35` | **Conflict** — Syndicate on `^15.5.12`. Supplier Intel must be upgraded to v15 during port. Small change in practice but flagged. |
| `next-auth` | `^4.24.13` | **Drop** — deleted entirely |
| `@prisma/client`, `prisma` | `^6.19.3` | **Drop** — no Prisma in Syndicate |
| `@radix-ui/*`, `tailwind-merge`, `clsx`, `class-variance-authority` | various | Syndicate already has these (likely satisfied by Syndicate's versions) |

### 1.11 Size signal

| Metric | Count |
|---|---|
| Lines of TS/TSX/JS/JSX (non-node_modules) | **13,607** |
| Page components | 12 |
| API routes | 21 |
| Prisma models | 12 |
| Prisma call sites | 104 CRUD + 5 `$transaction` |
| Auth call sites | 14 |

---

## Phase 2 — Port work, mapped concretely

### 2.1 Auth rewrite (NextAuth → `@supabase/ssr`)

**14 call sites to update.** Patterns:

| Current (NextAuth) | New (Syndicate pattern) |
|---|---|
| `const session = await getServerSession(authOptions)` in route handlers | `const supabase = createServerClient(...); const { data: { user } } = await supabase.auth.getUser()` |
| `const { data: session } = useSession()` in client components | `const { user, loading } = useAuth()` from `@lib/auth` |
| `signIn('credentials', { email, password })` | Delete; use Syndicate's `/login` flow |
| `signOut()` | Replace with `const { logout } = useAuth(); logout()` |

**Role removal:** Supplier Intel has `UserRole` enum `ADMIN | MEMBER`. The only place it's checked is `/api/admin/*` routes. Per user instruction ("all Syndicate users get full access"), convert `MEMBER`-gated endpoints to `authenticated-only` (any logged-in Syndicate user). Keep `ADMIN` gating only on the three admin routes, but use Syndicate's existing `role === 'admin'` check from the `public.users` table instead of Supplier Intel's `User.role`.

**Deletions:**
- `app/login/page.tsx` → neutered to redirect `/supplier-intel`
- `app/register/page.tsx` → neutered to redirect `/supplier-intel`
- `app/api/auth/**` → deleted entirely
- `app/api/admin/invite-codes/**` → deleted
- `app/api/admin/setup-db/**` → deleted (Supabase migrations replace it)
- `app/api/auth/register/**` → deleted
- `User.hashedPassword`, `User` model → deleted (Syndicate's `public.users` is the identity)
- `InviteCode` model → deleted

### 2.2 Database rewrite (Prisma → Supabase)

**11 tables to create.** `User` and `InviteCode` are dropped (covered by Syndicate's existing `public.users`).

**Name-collision strategy:** prefix every Supplier Intel table with `si_`. Reason: `Supplier` is too generic and could collide later; `si_supplier_lists` is unambiguous. This is a one-commit rename in the schema migration; every query uses `supabase.from('si_suppliers')` instead of `supabase.from('suppliers')`.

**Foreign-key linkage to Syndicate user:** Supplier Intel's `SupplierList.userId` and `DiscoverySearch.userId` currently point at its own `User` table. After the port, they point at `public.users.user_id` (uuid). Every FK column becomes `uuid REFERENCES public.users(user_id) ON DELETE CASCADE`.

**Draft SQL for the schema migration** (not executed in this plan):

```sql
-- 1. Core tables
CREATE TABLE public.si_supplier_lists (
    id         TEXT PRIMARY KEY,                 -- keep cuid() shape; generated client-side
    name       TEXT NOT NULL,
    user_id    UUID REFERENCES public.users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX si_supplier_lists_user_id_idx ON public.si_supplier_lists(user_id);

CREATE TYPE si_supplier_status AS ENUM ('PENDING','ANALYZING','DONE','FAILED');
CREATE TYPE si_workflow_status AS ENUM ('REVIEW','HIGH_PRIORITY','CONTACTED','FOLLOW_UP','RESPONDED','APPROVED','REJECTED');
CREATE TYPE si_outreach_status AS ENUM ('NOT_CONTACTED','READY_TO_CONTACT','CONTACTED','FOLLOW_UP_DUE','REPLIED','NO_RESPONSE','APPROVED','REJECTED');
CREATE TYPE si_next_action_type AS ENUM ('SEND_FIRST_EMAIL','FOLLOW_UP','CALL','REVIEW_REPLY','PREP_APPLICATION','WAIT');

CREATE TABLE public.si_suppliers (
    id                 TEXT PRIMARY KEY,
    list_id            TEXT NOT NULL REFERENCES public.si_supplier_lists(id) ON DELETE CASCADE,
    company_name       TEXT NOT NULL,
    website            TEXT,
    notes              TEXT,
    status             si_supplier_status NOT NULL DEFAULT 'PENDING',
    workflow_status    si_workflow_status NOT NULL DEFAULT 'REVIEW',
    rejection_reason   TEXT,
    outreach_status    si_outreach_status NOT NULL DEFAULT 'NOT_CONTACTED',
    next_action_type   si_next_action_type,
    next_action_date   TIMESTAMPTZ,
    next_action_note   TEXT,
    last_contact_at    TIMESTAMPTZ,
    outreach_started_at TIMESTAMPTZ,
    sequence_step      INTEGER NOT NULL DEFAULT 0,
    last_action_at     TIMESTAMPTZ,
    last_action_by     TEXT,
    outreach_priority  TEXT NOT NULL DEFAULT 'MEDIUM',
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX si_suppliers_list_id_idx ON public.si_suppliers(list_id);
CREATE INDEX si_suppliers_status_idx ON public.si_suppliers(status);
CREATE INDEX si_suppliers_workflow_status_idx ON public.si_suppliers(workflow_status);
CREATE INDEX si_suppliers_outreach_status_idx ON public.si_suppliers(outreach_status);
CREATE INDEX si_suppliers_next_action_date_idx ON public.si_suppliers(next_action_date);

CREATE TYPE si_classification AS ENUM ('BRAND','DISTRIBUTOR','WHOLESALER','RETAILER','LIQUIDATOR','MARKETPLACE_SELLER','UNCLEAR');
CREATE TYPE si_confidence AS ENUM ('LOW','MEDIUM','HIGH');
CREATE TYPE si_priority_level AS ENUM ('LOW','MEDIUM','HIGH');
CREATE TYPE si_recommendation AS ENUM ('STRONG_CANDIDATE','NEEDS_REVIEW','HIGH_RISK');

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

CREATE TYPE si_outreach_event_type AS ENUM ('EMAIL_DRAFTED','EMAIL_LOGGED','FOLLOW_UP_LOGGED','CALL_LOGGED','REPLY_LOGGED','NOTE');

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
CREATE INDEX si_outreach_events_created_at_idx ON public.si_outreach_events(created_at);

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

CREATE TYPE si_discovery_status AS ENUM ('PENDING','RUNNING','DONE','FAILED');

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

CREATE TYPE si_authorization_level AS ENUM ('STRONG','MODERATE','WEAK','NONE');

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
CREATE INDEX si_discovery_candidates_search_id_idx ON public.si_discovery_candidates(search_id);
CREATE INDEX si_discovery_candidates_supplier_id_idx ON public.si_discovery_candidates(supplier_id);

CREATE TABLE public.si_csv_imports (
    id         TEXT PRIMARY KEY,
    list_id    TEXT NOT NULL,
    filename   TEXT NOT NULL,
    row_count  INTEGER NOT NULL,
    imported   INTEGER NOT NULL,
    status     TEXT NOT NULL DEFAULT 'COMPLETED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TYPE si_follow_up_tier AS ENUM ('TIER_1','TIER_2','TIER_3');
CREATE TYPE si_follow_up_priority AS ENUM ('LOW','MEDIUM','HIGH');
CREATE TYPE si_contact_method AS ENUM ('EMAIL','PHONE','LINKEDIN','OTHER');

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
CREATE INDEX si_follow_ups_supplier_id_idx ON public.si_follow_ups(supplier_id);
CREATE INDEX si_follow_ups_assigned_to_idx ON public.si_follow_ups(assigned_to);
CREATE INDEX si_follow_ups_next_follow_up_date_idx ON public.si_follow_ups(next_follow_up_date);

CREATE TABLE public.si_follow_up_activities (
    id           TEXT PRIMARY KEY,
    follow_up_id TEXT NOT NULL REFERENCES public.si_follow_ups(id) ON DELETE CASCADE,
    action       TEXT NOT NULL,
    detail       TEXT,
    performed_by TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX si_follow_up_activities_follow_up_id_idx ON public.si_follow_up_activities(follow_up_id);
CREATE INDEX si_follow_up_activities_created_at_idx ON public.si_follow_up_activities(created_at);

-- RLS: all si_ tables are owner-scoped via list.user_id or search.user_id.
-- Tables without a direct user_id column enforce access via EXISTS on their parent.
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

-- Example owner policy (repeat the pattern for each owner-scoped table):
CREATE POLICY si_supplier_lists_owner_all
  ON public.si_supplier_lists FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Example child-via-parent policy (suppliers inherit owner from list):
CREATE POLICY si_suppliers_owner_all
  ON public.si_suppliers FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.si_supplier_lists l
    WHERE l.id = si_suppliers.list_id AND l.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.si_supplier_lists l
    WHERE l.id = si_suppliers.list_id AND l.user_id = auth.uid()
  ));

-- Email templates are shared across users (per current Prisma schema — no userId column).
CREATE POLICY si_email_templates_auth_all
  ON public.si_email_templates FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- Grants
GRANT ALL ON public.si_supplier_lists, public.si_suppliers, public.si_supplier_analyses,
            public.si_outreach_events, public.si_email_templates, public.si_discovery_searches,
            public.si_discovery_candidates, public.si_csv_imports, public.si_follow_ups,
            public.si_follow_up_activities
  TO authenticated, service_role;
```

**Prisma-specific features that need thoughtful rewriting:**

| Call site | Feature | Rewrite strategy |
|---|---|---|
| `app/api/discovery/route.ts` (lines 148, 156) | `$transaction(array)` — insert search + many candidates atomically | Supabase: single `.insert([...candidates])` after `.insert(search)`; rollback the search on child failure. Or write a Postgres function and call via RPC for real atomicity. |
| `app/api/follow-up/action/route.ts` (line 47) | `$transaction(async tx => {...})` — append activity + update follow-up + possibly update supplier | RPC function `si_log_follow_up_action(...)` that does all three in one Postgres transaction |
| `app/api/suppliers/[supplierId]/outreach/route.ts` (line 131) | `$transaction(async tx => {...})` — append event + update supplier's sequence_step + update workflow_status | RPC function `si_log_outreach_event(...)` |
| `app/api/suppliers/route.ts` (line 103) | `$transaction(array)` — bulk create suppliers | Single `.insert([...])` — already atomic per-call |

**Nested includes** (e.g. `follow-up/queue` fetches follow-ups + their supplier + analyses + latest outreach event): Supabase supports the same with embedded resources syntax: `.select('*, supplier:si_suppliers(*, analyses:si_supplier_analyses(*))')`. Straightforward translation, just verbose.

### 2.3 Route integration

Target structure in Syndicate:
```
syndicate/src/app/
  supplier-intel/
    page.tsx                        # replaces iframe wrapper (redirect to /supplier-intel/dashboard)
    dashboard/page.tsx
    lists/page.tsx
    lists/[listId]/page.tsx
    discovery/page.tsx
    suppliers/[supplierId]/page.tsx
    follow-up/page.tsx
    follow-up/templates/page.tsx
    admin/page.tsx
    settings/page.tsx
    layout.tsx                      # optional — reuse Syndicate's existing shell
  api/supplier-intel/
    analyze/[supplierId]/route.ts
    analyze/debug/route.ts
    chat/route.ts
    discovery/route.ts
    discovery/[searchId]/route.ts
    discovery/[searchId]/add/route.ts
    lists/route.ts
    lists/[listId]/route.ts
    suppliers/route.ts
    suppliers/[supplierId]/route.ts
    suppliers/[supplierId]/outreach/route.ts
    suppliers/[supplierId]/workflow-status/route.ts
    follow-up/queue/route.ts
    follow-up/action/route.ts
    follow-up/templates/route.ts
    admin/rescore/route.ts
```

**Route collisions:** None. Syndicate doesn't use `/supplier-intel/*` for anything except the current iframe wrapper (which gets replaced), and `/api/supplier-intel/*` is unused.

**Current iframe wrapper** at `syndicate/src/app/supplier-intel/page.tsx` (the whole 124-line iframe component) **gets replaced** with a redirect to `/supplier-intel/dashboard`.

### 2.4 Third-party integration check

| Package | Works in Syndicate (Next.js 15, React 18, Node 20)? |
|---|---|
| `@anthropic-ai/sdk ^0.27.0` | ✅ Pure Node SDK, no Next.js version pinning. |
| `openai ^4.104.0` | ✅ Same. |
| `cheerio ^1.0.0` | ✅ Node-only. |
| `papaparse ^5.4.1` | ✅ Works in browser and Node. |

**Env vars to add to Syndicate's Railway service:**
- `ANTHROPIC_API_KEY` (mandatory — core feature depends on it)
- `OPENAI_API_KEY` (verify usage during port; may be dead code)

### 2.5 UI and styling

**Shared stack:** ✅ Same Tailwind major, same Radix primitives (Syndicate has more), same `lucide-react`. No CSS-framework reconciliation.

**Design system:** Syndicate has `src/components/ui/ds.tsx` (custom dark design system — `DsCard`, `MetricCard`, `PageShell`, `PageHeader`, `DsTable`, `DsStatusPill`, etc.). Supplier Intel's pages don't use this. The two choices:

- **Option 1: Keep Supplier Intel's styling as-is, isolated to `/supplier-intel/*` pages.** Uses Syndicate's Tailwind config and Radix, but the UI won't look like the rest of Syndicate (no premium dark mono headers, no orange/gold accent system). Fastest port. Acceptable for pre-launch.
- **Option 2: Restyle Supplier Intel pages to use Syndicate's DS primitives during the port.** Matches Syndicate's look. Adds ~4-6 hours per page (12 pages × ~30min each → ~6 extra hours). Much nicer end state.

**Recommendation: Option 1 for the port, Option 2 as a follow-up pass.** Shipping functional-but-inconsistent beats shipping delayed-but-polished for a pre-launch product.

**Global CSS leaks:** Supplier Intel's `app/globals.css` probably has CSS variables for its color theme. Namespace or scope these to `/supplier-intel/*` via a route-segment `layout.tsx` that imports its own stylesheet, so they don't bleed into Syndicate's other pages.

---

## Phase 3 — Time estimate (honest)

| Area | Hours | What could push higher |
|---|---|---|
| Schema migration: 11 tables + RLS + 12 enum types + indexes | 4-8 | JSON blob shape preservation on `si_supplier_analyses`; FK cascade semantics need testing |
| Auth rewrite: 14 call sites + page neutering + NextAuth deletion | 3-6 | Discovering hidden session.user.id reads in components we didn't grep for |
| Prisma → Supabase query rewrite: 104 CRUD + 5 transactions | **10-18** | `$transaction` RPCs require Postgres function writing + testing; nested `include` → embedded resources needs per-query verification; type-safety loss (no generated client) means runtime errors replace compile errors |
| Route integration + page moves: 12 pages, 17 API routes | 2-4 | Per-page path updates to imports/links/router.push |
| Third-party env + one-time verification | 0.5-1 | — |
| UI styling (Option 1: isolate; Option 2: restyle) | 0-6 | Option 1 assumed; Option 2 adds 4-6 |
| Dependency installs + Next.js 14→15 alignment | 1-2 | `next-auth` removal may leave stranded types; `prisma` removal may leave orphaned imports |
| End-to-end testing + bug-fixing + user iteration | 3-6 | Discovery analysis pipeline is ~30-90s per call; testing is slow |
| **Total** | **23-46 hours** | |

**Verdict:** LARGE — a week-plus project, best done in 3-4 focused sessions with checkpoints between.

---

## Phase 4 — Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **`$transaction` translations** — 5 sites where Prisma provides atomic multi-statement transactions with type-safe `tx` parameters. Supabase has no client-level equivalent; requires Postgres RPC functions. | High | High | Write RPC functions as part of the schema migration; each site becomes a single `supabase.rpc('si_xxx', {...})` call. Budget ~1hr per RPC. |
| **JSON blob shape regressions on `si_supplier_analyses`** — The scoring UI depends on `scoreBreakdown`, `greenFlags`, `redFlags`, `extractedSignals`, `scrapeDiagnostics` having specific shapes. A TypeScript-typed Prisma model enforced this at compile time; Supabase's `Json` type is untyped. A subtle shape drift during port causes UI bugs that only surface in production. | Medium | Medium-High | Add runtime validation (zod) in the analysis write path. Preserve exact JSON shapes. Pin a test: "run an analysis, verify the saved JSONB matches the expected shape." |
| **Analysis endpoint is synchronous 30-90s** — `/api/analyze/[supplierId]` scrapes a website and calls Claude inline. In development it works; in production, Railway's default request timeout may kill it before Claude returns. Supplier Intel has been running this way, so presumably Railway allows it, but verify. | Medium | High | Test the analyze path early in Session 2 on the preview deploy. If it times out, refactor to a queue (big scope add) or bump Railway's timeout. |
| **cuid() vs uuid id shape** — Supplier Intel generates IDs as cuids client-side (`TEXT PRIMARY KEY`). Syndicate's tables use auto-increment INTEGER or uuid. Mixing `TEXT` primary keys with Syndicate's existing `uuid` FK column for `user_id` is fine (they don't overlap), but keep the convention consistent within `si_*` tables to avoid confusion. | Low | Low | Just use `TEXT` for all si_* primary keys. Generate cuids in the app layer as before. |
| **OpenAI key — is it actually used?** | Low | Low | Grep during port; if unused, skip the env var and drop the `openai` dep. |
| **Invite-code removal in the middle of NextAuth removal** | Low | Low | Both happen in the same commit. No users exist, no transitional state to support. |
| **Syndicate pre-launch means zero pressure on backwards-compat** | — | — | **This is a boon, not a risk** — we can break Syndicate freely during the port. Dramatically de-risks the whole project. |

---

## Phase 5 — Execution plan

### Commit sequence

**Commit 1 — Schema migration.** `syndicate/supabase/migrations/YYYYMMDDHHMMSS_add_supplier_intel_tables.sql`. Contains the SQL from Section 2.2 plus the 4 RPC functions for the `$transaction` sites (`si_log_outreach_event`, `si_log_follow_up_action`, `si_insert_discovery_with_candidates`, `si_bulk_insert_suppliers`). Also adds `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` to Railway Variables. **Test checkpoint:** user checks Supabase dashboard → tables exist, RLS enabled, functions registered.

**Commit 2 — Dependencies and scaffolding.** `npm install @anthropic-ai/sdk openai cheerio papaparse @types/papaparse` in the Syndicate repo. Create `src/app/supplier-intel/` and `src/app/api/supplier-intel/` directories with placeholder `page.tsx` redirects. Add a typed Supabase data-access module at `src/lib/supplierIntel/` that wraps all CRUD so page components don't duplicate query logic. **Test checkpoint:** Syndicate still builds; `/supplier-intel` still renders (redirect placeholder).

**Commit 3 — Port read-only pages.** `/supplier-intel/dashboard`, `/supplier-intel/lists`, `/supplier-intel/lists/[listId]`. Wire each to Syndicate's `useAuth()` and the new data-access module. Remove role gating. Skip the write paths for now. **Test checkpoint:** user logs in as admin, can navigate to these three pages, sees empty state (no data yet).

**Commit 4 — Port write pages + API.** `/supplier-intel/discovery`, `/suppliers/[supplierId]`, `/follow-up`, `/follow-up/templates`, `/admin`, `/settings`. All 17 API routes. Each API route is `createServerClient` + `auth.getUser()` + `supabase.rpc(...)` or `supabase.from(...)`. **Test checkpoint:** user runs a full discovery → adds a candidate → analyzes → logs an outreach event → logs a follow-up. Full happy path works.

**Commit 5 — Remove iframe wrapper.** Replace `syndicate/src/app/supplier-intel/page.tsx` with `redirect('/supplier-intel/dashboard')`. Update `src/components/app-sidebar.tsx` so the Supplier Intel sidebar link points to `/supplier-intel/dashboard` (or keep as `/supplier-intel` and let the redirect happen). **Test checkpoint:** clicking the Supplier Intel sidebar tab lands on the native dashboard, not the iframe.

**Commit 6 — Cleanup.** Remove `openai` if unused. Archive or delete the separate Supplier Intel Railway service (user's call — leaving it running for external direct users with a "moving to Syndicate" banner is also fine). Update `POSTMORTEM.md` or a new `SUPPLIER_INTEL_PORT_POSTMORTEM.md` with what landed.

### Branch + preview workflow

- All work happens on a long-lived branch: `port-supplier-intel` (NOT `supplier-intel-port-plan` — that's this doc's branch).
- Railway can auto-deploy a PR branch to a preview URL if GitHub integration is enabled. Confirm in Railway dashboard → Settings → Deploy triggers. If preview deploys aren't set up, enable them before Session 2 (~15min).
- User tests each commit on the preview URL before merging to `main`.
- Final merge after all 6 commits pass checkpoints. Squash merge OK; individual commits give clearer history.

### Testing checklist per session

**Session 2 (Commits 1-2):**
- [ ] Supabase tables appear with RLS enabled
- [ ] RPC functions callable with service role
- [ ] Syndicate builds, `npm run build` clean
- [ ] Preview URL loads, `/supplier-intel` redirects

**Session 3 (Commits 3-4):**
- [ ] Every page renders without console errors
- [ ] Lists: create, rename, delete
- [ ] Discovery: run → results come back → add candidate → candidate appears in list
- [ ] Supplier detail: analysis triggers, Claude returns, JSON shape preserved
- [ ] Outreach event logged, appears in supplier history
- [ ] Follow-up queue shows assigned items
- [ ] Admin rescore runs for a small batch

**Session 4 (Commits 5-6):**
- [ ] Iframe page is gone; sidebar tab routes to native dashboard
- [ ] RLS: a second test user cannot see first user's lists
- [ ] Logout from Syndicate ends Supplier Intel access too
- [ ] Standalone Supplier Intel Railway deploy is either decommissioned or banner-marked as migrating

---

## Appendix — What the existing `/supplier-intel/page.tsx` does today

Currently renders an `<iframe src="https://supplier-intel-production.up.railway.app">` with a 40px top bar. Loading/error states. Auth-guarded via Syndicate's `useAuth()`. **Kept functional until Commit 5 replaces it with a redirect.**

---

## Appendix — Files-not-to-touch

- `github.com/philk6/Supplier-Intel` — read-only clone for reference. No PRs, no pushes.
- `supplier-intel-production.up.railway.app` — keeps running until Commit 6.

---

**End of plan.** Next step if approved: user confirms, then Session 2 begins with Commit 1 (schema migration).
