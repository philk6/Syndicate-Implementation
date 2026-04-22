# Supplier Intel Port — Status

**Branch:** `port-supplier-intel`
**Parent:** `main`
**Status:** Session 1 complete; Session 1.5 (verification) partially complete; Session 2 not started.
**This doc updates each session** so the next one can pick up with full context.

---

## Session 1 (shipped) — read-only foundation

| Commit | Summary |
|---|---|
| `35269cf` | Timeout probe route (diagnostic; delete in Phase 5) |
| `99fdad8` | Schema migration applied: 11 tables, 15 enums, 4 RPCs, RLS, all HTTP 200 |
| `1223b94` | Deps installed; `src/lib/supplierIntel/*` scaffolded; iframe page replaced with redirect |
| `a99fa1d` | Read-only pages: dashboard + lists + lists/[listId] + 3 API routes |
| `005499f` | Status doc (this file's Session 1 version) |

**OpenAI verdict:** kept — `lib/analyzer.ts` calls `getOpenAIClient()` and reads `OPENAI_API_KEY`.
**cuid decision:** `@paralleldrive/cuid2` via explicit `createId()` (Prisma's `@default(cuid())` auto-gen is gone with Prisma).

---

## Session 1.5 (verification) — what was checked

### ✅ Verified from Claude Code environment

| Check | Result |
|---|---|
| Branch `port-supplier-intel` pushed to origin, fully synced | ✅ 0 ahead / 0 behind |
| `npm run build` | ✅ Clean — 39 routes compile, zero errors |
| `npx tsc --noEmit` | ✅ Clean — zero type errors |
| Baseline RLS: anon-key reads on all 10 si_* tables | ✅ All return `[]` — RLS enabled and blocking unauthenticated reads |
| RLS script written: `scripts/verify-si-rls.ts` (commit `271aa26`) | ✅ Ready to run once test creds available |

### ⏳ Requires user action (cannot run from Claude Code environment)

| Check | What you need to do |
|---|---|
| **Railway preview URL** | Railway Dashboard → Syndicate service → Settings → enable "PR Environments" / auto-deploy branches. Get the preview URL for `port-supplier-intel` and run the probe and smoke tests on it. |
| **Env vars on Railway** | Set `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` in the Syndicate service Variables. Not strictly needed until Session 2 ships analyze/chat/discovery, but set them now to avoid forgetting. |
| **Timeout probe (60s and 90s)** | `curl -i -m 120 "https://<preview-url>/api/supplier-intel/timeout-probe?key=timeout-probe"` — wait 60+ sec. Then repeat with `&ms=90000`. Paste responses; I'll record them in `docs/SUPPLIER_INTEL_PROBE_RESULT.md` and decide sync vs async for Session 2. |
| **Smoke test read-only pages on preview** | `/supplier-intel` → redirects to dashboard; dashboard loads with zero stats; lists loads with empty state; `/supplier-intel/lists/nonexistent-id` shows "List Not Found" gracefully. |
| **Full RLS script** | Create two test users in Supabase Auth (Dashboard → Authentication → Users → Add User). Each needs a row in `public.users`. Then:<br>`export SI_TEST_USER_A_EMAIL=... SI_TEST_USER_A_PASSWORD=... SI_TEST_USER_B_EMAIL=... SI_TEST_USER_B_PASSWORD=...`<br>`npx tsx scripts/verify-si-rls.ts` — expected exit 0. Paste the output. |

---

## Session 2 plan (not yet executed)

**Do not start Session 2 until the verification items above are complete and green.**

### Prerequisites before Session 2
1. Probe result recorded — determines sync vs async for analyze endpoint
2. RLS script passes — confirms policies work end-to-end before writes start flowing
3. Preview URL confirms read-only surface renders correctly
4. `ANTHROPIC_API_KEY` set on Railway

### Session 2 scope (~8-12 hours)

Execute in this order, committing between each group so you can bisect:

**Group A — lib port (independent, can parallelize):**
- Port `lib/analyzer.ts` → `src/lib/supplierIntel/analyzer.ts` (Claude scoring)
- Port `lib/scraper.ts` → `src/lib/supplierIntel/scraper.ts` (cheerio scraping)
- Port `lib/scorer.ts` → `src/lib/supplierIntel/scorer.ts`
- Port `lib/signals.ts` → `src/lib/supplierIntel/signals.ts`
- Port `lib/pipeline.ts` → `src/lib/supplierIntel/pipeline.ts`
- Port `lib/discoveryAngles.ts` → `src/lib/supplierIntel/discoveryAngles.ts`
- Port `lib/discovery.ts` → `src/lib/supplierIntel/discovery.ts`
- Port `lib/outreach-sequence.ts` → `src/lib/supplierIntel/outreachSequence.ts`
- These are mostly pure TS; only surgical changes are dropping Prisma imports in favor of the data-access layer.

**Group B — analyze endpoint (depends on Group A):**
- `POST /api/supplier-intel/analyze/[supplierId]` — sync if probe OK, async if probe fails
- `POST /api/supplier-intel/analyze/debug`
- Worker route if async (processes `si_analysis_jobs` queue)
- `GET /api/supplier-intel/analyze/[supplierId]/status` if async
- Supplier detail page `/supplier-intel/suppliers/[supplierId]` — "Analyze" button wires up here
- Zod validation on every JSONB write using `schemas.ts`

**Group C — discovery (depends on Group A):**
- `POST /api/supplier-intel/discovery` — uses `si_insert_discovery_with_candidates` RPC
- `GET|DELETE /api/supplier-intel/discovery/[searchId]`
- `POST /api/supplier-intel/discovery/[searchId]/add` — moves candidate into a list
- `/supplier-intel/discovery` page (the UI with brand/category/location inputs + results)

**Group D — follow-up (depends only on schema, can parallelize with B/C):**
- `GET|PATCH /api/supplier-intel/follow-up/queue`
- `POST /api/supplier-intel/follow-up/action` — uses `si_log_follow_up_action` RPC
- `GET|POST /api/supplier-intel/follow-up/templates`
- `/supplier-intel/follow-up` + `/supplier-intel/follow-up/templates` pages

**Group E — suppliers write + outreach (depends on A for CSV parsing):**
- `POST /api/supplier-intel/suppliers` — manual + CSV via `papaparse` + `si_bulk_insert_suppliers` RPC
- `PUT /api/supplier-intel/suppliers/[supplierId]`
- `POST /api/supplier-intel/suppliers/[supplierId]/outreach` — uses `si_log_outreach_event` RPC
- `POST /api/supplier-intel/suppliers/[supplierId]/workflow-status`

**Group F — chat + admin + settings (leaves):**
- `POST /api/supplier-intel/chat` (Claude chat widget)
- `/supplier-intel/admin` + `POST /api/supplier-intel/admin/rescore` (admin-gated via `requireAdminUser`)
- `/supplier-intel/settings`

**Group G — cleanup (last):**
- Delete timeout-probe route
- Verify sidebar link still works
- Add `SUPPLIER_INTEL_PORT_POSTMORTEM.md`
- Re-run RLS script (no regressions from write flows)

### Dependency graph

```
Group A (lib port, independent)
  ├── Group B (analyze) ─┐
  ├── Group C (discovery)┤
  └── Group E (suppliers/outreach)
Group D (follow-up) — needs schema only, independent of A-C-E
Group F (chat/admin/settings) — mostly independent
Group G (cleanup) — runs last
```

A efficient Session 2 executes A first (~3-4h), then B+C+D in parallel via agents (~4-5h), then E+F together (~2-3h), then G (~1h). **Total: 10-13 hours** — fits in one long session but tight; budget for two.

---

## Outstanding risks (from earlier sessions)

1. **Analyze endpoint sync-vs-async** — depends on the probe.
2. **JSONB shape drift on si_supplier_analyses** — mitigated by zod in `schemas.ts`. Every write path must call `.parse()` before insert.
3. **`$transaction` RPC correctness** — the 4 RPC functions in the schema migration have specific semantics; bugs there manifest as subtle data issues, not failures. Smoke-test each RPC call during Session 2.
4. **Dashboard stats scale** — current implementation fetches up to 500 analyses and dedupes client-side for latest-per-supplier. Fine for pre-launch; write a proper RPC or view if supplier volumes grow.
5. **Syndicate DS styling on Session 2 pages** — use `ds.tsx` primitives to match the rest of the app. Session 1's read-only pages set the pattern.

---

## Commit log (all sessions, for grepability)

```
005499f  docs(supplier-intel): add Session 1 status / handoff doc
271aa26  test(supplier-intel): RLS verification script
a99fa1d  feat(supplier-intel): port read-only pages (dashboard, lists)
1223b94  feat(supplier-intel): scaffold routes, install deps, Next.js 15 compat
99fdad8  feat(supplier-intel): add si_ schema, RPC functions, and RLS
35269cf  feat(probe): add timeout probe for Railway sync-request validation
```
