// TODO(remove-after-diag): This endpoint exists solely to surface the root
// cause of the "fetchUserDetails silently hangs on Railway" bug. Once the
// issue is identified and fixed, delete this file.

import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Step = Record<string, unknown>;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const overrideUserId = url.searchParams.get('userId');
  const useServiceRole = url.searchParams.get('serviceRole') === '1';

  const startedAt = Date.now();
  const steps: Step[] = [];
  const step = (name: string, data: Record<string, unknown>) => {
    steps.push({ name, atMs: Date.now() - startedAt, ...data });
  };

  const baseOut = {
    runtime: {
      now: new Date().toISOString(),
      node: process.version,
      region: process.env.RAILWAY_REGION ?? null,
      deployId: process.env.RAILWAY_DEPLOYMENT_ID ?? null,
    },
    supabase: {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL
        ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host
        : 'unset',
      hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
    steps,
  };

  try {
    // 1. Build the server client, mirroring what middleware + the browser use.
    //    If serviceRole=1 is passed, use the service-role key to bypass RLS —
    //    comparing results with/without this flag tells us if RLS is the cause.
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      useServiceRole
        ? process.env.SUPABASE_SERVICE_ROLE_KEY!
        : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: () => {
            /* no-op: read-only debug endpoint */
          },
        },
      },
    );
    step('client-built', { useServiceRole });

    // 2. Identify the user (session check). Always runs, even with ?userId=.
    let userId = overrideUserId;
    const tUser = Date.now();
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    step('auth.getUser', {
      elapsedMs: Date.now() - tUser,
      hasUser: !!userData?.user,
      sessionUserId: userData?.user?.id ?? null,
      sessionEmail: userData?.user?.email ?? null,
      error: userErr?.message ?? null,
    });

    if (!userId) {
      if (userErr || !userData?.user) {
        return NextResponse.json(
          { ok: false, reason: 'no-session', totalElapsedMs: Date.now() - startedAt, ...baseOut },
          { status: 200 },
        );
      }
      userId = userData.user.id;
    }

    // 3. Run the EXACT profile query lib/auth.tsx runs:
    //    supabase.from('users').select('user_id, email, role, firstname, lastname, company_id, tos_accepted, buyersgroup').eq('user_id', userId).single()
    //    We use maybeSingle() here so a missing row shows up as data=null, error=null
    //    instead of throwing — that distinguishes "row doesn't exist" from "RLS blocked it".
    const tUsers = Date.now();
    const probeController = new AbortController();
    const probeTimer = setTimeout(() => probeController.abort(), 15000);
    try {
      const usersResult = await supabase
        .from('users')
        .select('user_id, email, role, firstname, lastname, company_id, tos_accepted, buyersgroup')
        .eq('user_id', userId)
        .abortSignal(probeController.signal)
        .maybeSingle();
      step('users-query', {
        elapsedMs: Date.now() - tUsers,
        hasData: !!usersResult.data,
        data: usersResult.data ?? null,
        error: usersResult.error
          ? {
              message: usersResult.error.message,
              code: usersResult.error.code,
              details: usersResult.error.details,
              hint: usersResult.error.hint,
            }
          : null,
      });
    } catch (e) {
      step('users-query-threw', {
        elapsedMs: Date.now() - tUsers,
        message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      clearTimeout(probeTimer);
    }

    // 4. Probe XP view — fetchUserDetails queries this in parallel
    const tXp = Date.now();
    const xpController = new AbortController();
    const xpTimer = setTimeout(() => xpController.abort(), 15000);
    try {
      const xpResult = await supabase
        .from('user_total_xp')
        .select('total_xp')
        .eq('user_id', userId)
        .abortSignal(xpController.signal)
        .maybeSingle();
      step('xp-query', {
        elapsedMs: Date.now() - tXp,
        data: xpResult.data ?? null,
        error: xpResult.error?.message ?? null,
      });
    } catch (e) {
      step('xp-query-threw', {
        elapsedMs: Date.now() - tXp,
        message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      clearTimeout(xpTimer);
    }

    // 5. Bonus — RLS probe. A count-by-head query tells us if we can see ANY
    //    users rows at all. If count=1 and .data is null above, the self-lookup
    //    is hitting a filter issue rather than a total RLS block.
    const tCount = Date.now();
    const countResult = await supabase
      .from('users')
      .select('user_id', { count: 'exact', head: true });
    step('users-count', {
      elapsedMs: Date.now() - tCount,
      count: countResult.count,
      error: countResult.error?.message ?? null,
    });

    return NextResponse.json({
      ok: true,
      totalElapsedMs: Date.now() - startedAt,
      queriedUserId: userId,
      ...baseOut,
    });
  } catch (err) {
    step('top-level-exception', {
      message: err instanceof Error ? err.message : String(err),
      name: err instanceof Error ? err.name : undefined,
      cause: err instanceof Error ? String(err.cause ?? '') : undefined,
    });
    return NextResponse.json(
      {
        ok: false,
        totalElapsedMs: Date.now() - startedAt,
        ...baseOut,
      },
      { status: 200 },
    );
  }
}
