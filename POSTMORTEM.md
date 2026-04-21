# Postmortem — Auth-Hang Bug on Railway Production

## Timeline of symptoms

1. User logs into `syndicate-implementation-production.up.railway.app`.
2. Dashboard loads; a loading spinner appears.
3. The spinner never resolves. The page hangs indefinitely.
4. DevTools console output (the full log before silence):
   ```
   Route changed to: /login
   Tab active state changed: true
   [auth] AuthProvider mount effect running
   [auth] mount: initial getSession
   [auth] onAuthStateChange: Object
   [auth] applySession: Object
   [auth] fetchUserDetails: querying user_id = bea6fb27-738d-4d6c-94f1-9c93f2a3de94
   Route changed to: /dashboard
   ```
   No `fetchUserDetails: success` or `fetchUserDetails: error` log follows.
   No rejected promise, no thrown exception — silent hang.
5. Does not reproduce on `npm run dev` locally.

## Root cause

A `supabase.from('users').select(...).eq('user_id', ...).single()` call in
`fetchUserDetails` (`lib/auth.tsx`) had no timeout or abort signal. On
Railway, when the TCP connection to the Supabase region stalled (cold start,
transient network event, region-crossing latency spike), the awaited fetch
never resolved or rejected. The `loading` flag in the AuthProvider was
therefore never released.

Compounding factors:
- The `onAuthStateChange` handler re-invoked `fetchUserDetails` on every
  `TOKEN_REFRESHED` event, including the one fired when the tab refocused.
  Each fire rolled the dice on another potential hang.
- A `visibilitychange` handler explicitly called `checkAuth()` (→
  `fetchUserDetails`) on tab refocus when the session was near expiry.
  Duplicate work on top of Supabase's own autoRefreshToken.
- No client-side safety net: loading could stay true forever.

The `@supabase/ssr` migration (commit `7d729cb`) was the correct fix for a
different bug (dual GoTrueClient instances) but did not address the missing
timeout.

## Fix

Commit-scoped changes in `lib/auth.tsx` and `lib/supabase/client.ts`:

| Phase | Change | File |
|---|---|---|
| 3.1 | `fetchUserDetails` wrapped in `AbortController` with 8s timeout, `.abortSignal()` passed to PostgREST queries | `lib/auth.tsx` |
| 3.3 | `onAuthStateChange` now returns early on `TOKEN_REFRESHED`, `USER_UPDATED`, `PASSWORD_RECOVERY`; also dedupes by `user_id` (only refetches profile on true identity change) | `lib/auth.tsx` |
| 3.5 | Visibility handler no longer calls `checkAuth()` — it only toggles the `isTabActive` flag. Supabase's built-in `autoRefreshToken` handles focus refreshes. | `lib/auth.tsx` |
| 3.6 | STUCK-LOADING safety net: if `loading` stays true >12s, force-release it and log an error | `lib/auth.tsx` |
| 3.7 | Global 15s fetch timeout on Supabase browser client (belt-and-suspenders). Added `flowType: 'pkce'` for security. | `lib/supabase/client.ts` |

## Follow-up items not done in this session

1. **Delete `amplify.yml`** — Railway is the deploy target; Amplify config is dead weight.
2. **Replace `xlsx` package** (CVE-2023-30533) with patched SheetJS CDN build or `exceljs`.
3. **Bump `date-fns`** from pinned `3.0.0` to latest 3.x (peer-check `react-day-picker` first).
4. **Playwright tab-focus test** (`e2e/auth-tab-focus.spec.ts`) — sign in as admin, blur tab for 60s, refocus, assert admin UI still visible.
5. **TanStack Query** for profile fetch — replaces the hand-rolled dedupe/cache logic with a proper library (`staleTime: 5*60_000`, `refetchOnWindowFocus: false`, exponential retry).
6. **Railway/Supabase region pairing** — verify both services are in the same continent. Cross-region latency is what made the missing timeout fatal.
7. **Database introspection** — run the SQL checks in Phase 4 of the prompt against Supabase to confirm `public.users` lookup uses an index and RLS policies on `users` are not recursive.
