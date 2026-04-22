# Supplier Intel Port — Session 1 Status

**Branch:** `port-supplier-intel`
**Parent:** `main`
**Status:** partially complete — read-only foundation shipped, write surface + analyze pipeline pending
**Next session:** Phase 4 (write flows) + Phase 5 (cleanup)

---

## What's shipped on this branch

### Commit `35269cf` — Timeout probe (diagnostic only)
- `src/app/api/supplier-intel/timeout-probe/route.ts` — gated by `?key=timeout-probe`, sleeps for 60s and returns elapsed time
- **Still needs to be tested** on the Railway preview URL to decide sync vs async analyze
- Delete in Phase 5

### Commit `99fdad8` — Schema migration
- `supabase/migrations/20260421120000_add_supplier_intel.sql` — applied to Syndicate's Supabase
- **11 tables** created (all with `si_` prefix), **15 enums**, **RLS on everything**, **4 RPC functions**
- `si_analysis_jobs` included unconditionally for optional async fallback
- All tables verified via REST (HTTP 200)

### Commit `1223b94` — Scaffold + deps
- Dependencies: `@anthropic-ai/sdk`, `openai`, `cheerio`, `papaparse`, `zod`, `@paralleldrive/cuid2`
- OpenAI verdict: **kept** — `lib/analyzer.ts` in source imports it (`getOpenAIClient`, reads `OPENAI_API_KEY`)
- `src/lib/supplierIntel/types.ts` — ported from source verbatim (326 lines)
- `src/lib/supplierIntel/server.ts` — `getSupabaseServerClient`, `getServiceRoleClient`, `requireAuthenticatedUser`, `requireAdminUser` helpers
- `src/lib/supplierIntel/schemas.ts` — zod schemas for the `si_supplier_analyses` JSONB blobs (runtime validation replacing Prisma's compile-time types)
- `src/lib/supplierIntel/db.ts` — typed CRUD + RPC wrappers for all 11 tables
- `src/app/supplier-intel/page.tsx` — was iframe, now `redirect('/supplier-intel/dashboard')`

### Commit `a99fa1d` — Read-only pages
- **API routes (all `force-dynamic`, Node runtime, auth-gated):**
  - `GET /api/supplier-intel/dashboard` — aggregated stats
  - `GET|POST /api/supplier-intel/lists`
  - `GET|PUT|DELETE /api/supplier-intel/lists/[listId]`
- **Pages (all client components, styled with Syndicate's DS):**
  - `/supplier-intel/dashboard` — 4 MetricCards + quick actions
  - `/supplier-intel/lists` — create/list/delete lists with supplier counts
  - `/supplier-intel/lists/[listId]` — list detail + suppliers table
- Build clean (39 routes compile).

---

## What's NOT shipped (pending Session 2)

### Write surface — Phase 4 in the plan doc

| Surface | Source files | Port target | Notes |
|---|---|---|---|
| Discovery | `app/(dashboard)/discovery/page.tsx`, `app/api/discovery/*`, `lib/discovery.ts`, `lib/discoveryAngles.ts` | `src/app/supplier-intel/discovery/*`, `src/app/api/supplier-intel/discovery/*` | Uses Claude multi-angle search. Calls `si_insert_discovery_with_candidates` RPC for atomic insert. |
| Supplier detail + analyze | `app/(dashboard)/suppliers/[supplierId]/page.tsx`, `app/api/analyze/*`, `lib/analyzer.ts`, `lib/scraper.ts`, `lib/scorer.ts`, `lib/signals.ts`, `lib/pipeline.ts` | `src/app/supplier-intel/suppliers/[supplierId]/*`, `src/app/api/supplier-intel/analyze/*` | **Sync-vs-async decision pending** on probe result. Heaviest single path — scrape + Claude call = 30-90s. Validate JSONB writes with `schemas.ts` zod. |
| Follow-up queue | `app/(dashboard)/follow-up/*`, `app/api/follow-up/*` | `src/app/supplier-intel/follow-up/*`, `src/app/api/supplier-intel/follow-up/*` | Uses `si_log_follow_up_action` RPC for atomic action logging. |
| Email templates | `app/(dashboard)/follow-up/templates/*`, `app/api/follow-up/templates/*` | `src/app/supplier-intel/follow-up/templates/*`, `src/app/api/supplier-intel/follow-up/templates/*` | Shared across users per RLS design. |
| Outreach logging | `app/api/suppliers/[supplierId]/outreach/*`, `app/api/suppliers/[supplierId]/workflow-status/*` | `src/app/api/supplier-intel/suppliers/[supplierId]/*` | Uses `si_log_outreach_event` RPC. |
| Chat assistant | `app/api/chat/*` | `src/app/api/supplier-intel/chat/*` | Claude-backed chat widget. Check for any component that embeds it. |
| Admin rescore | `app/(dashboard)/admin/*`, `app/api/admin/rescore/*` | `src/app/supplier-intel/admin/*`, `src/app/api/supplier-intel/admin/rescore/*` | Keep admin-gated using `requireAdminUser` (Syndicate's `role === 'admin'`). |
| Settings | `app/(dashboard)/settings/*` | `src/app/supplier-intel/settings/*` | Per-user prefs (Supplier Intel's user-level settings). Minor. |

### Port-specific carryovers

- **lib files to port:** `lib/analyzer.ts`, `lib/scraper.ts`, `lib/scorer.ts`, `lib/signals.ts`, `lib/pipeline.ts`, `lib/discoveryAngles.ts`, `lib/discovery.ts`, `lib/outreach-sequence.ts`. These are mostly pure TypeScript with minor Prisma touches — find-and-replace Prisma reads/writes with Supabase equivalents.
- **Suppliers CRUD:** `POST /api/supplier-intel/suppliers` with `papaparse` CSV import calling `si_bulk_insert_suppliers` RPC.
- **Zod validation for every JSONB write to `si_supplier_analyses`.** Already wired up; just use it.
- **CSV import path** uses `papaparse` + service-role client (or user client with the bulk RPC).

### Cleanup — Phase 5

- Delete `src/app/api/supplier-intel/timeout-probe/` once sync/async decision is final.
- `SUPPLIER_INTEL_PORT_POSTMORTEM.md` at repo root describing the port.
- Sidebar link is already correct (`/supplier-intel` → redirect to `/supplier-intel/dashboard`).

### User-facing TODOs

- **Set `ANTHROPIC_API_KEY` in Railway** (required for analyze/discovery in Phase 4).
- **Set `OPENAI_API_KEY` in Railway** (confirmed used by `lib/analyzer.ts`).
- **Run the timeout probe** — determines whether Phase 4's analyze endpoint is sync or async.
- **Verify RLS** once real data exists: sign in as a second user, confirm you cannot see other user's lists.

---

## How to test what's shipped now

Once Railway deploys the `port-supplier-intel` branch (or you merge it to main), while logged in as any Syndicate user:

1. **Go to `/supplier-intel`** (either click the sidebar link or visit directly) — should land on `/supplier-intel/dashboard`.
2. **Dashboard** shows 4 metric cards. All will be `0` since no data exists yet. Click "Manage Lists".
3. **Lists page** — create a list named "Test List". Confirm it appears. Click through to detail.
4. **List detail** shows an empty state saying supplier creation arrives in the next port phase. This is correct.
5. **Delete the list** — trash icon next to a list. Confirm, verify it's gone.
6. **Second-user RLS test** — sign in as a different Syndicate user (if you have one). Confirm the first user's list does NOT appear. This validates RLS.

If any of the above fails, it's a bug in what landed this session — report back with the error.

---

## Estimated remaining work for Phase 4

From the plan doc (`docs/SUPPLIER_INTEL_PORT_PLAN.md`): 10-18 hours for Prisma → Supabase query rewrites, plus 3-6 hours for end-to-end testing. So **13-24 hours of focused work remains.** Best split across two more sessions:

- **Session 2:** Port discovery + suppliers detail + analyze (sync or async per probe). ~8-12h.
- **Session 3:** Port follow-up + templates + admin + chat + cleanup + postmortem. ~5-12h.

The schema and scaffolding decisions are locked in this session; Session 2/3 is pure code translation.
