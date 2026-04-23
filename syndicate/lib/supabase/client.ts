import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | undefined;

/**
 * Global fetch wrapper that imposes a 10-second hard timeout on every
 * request made by the Supabase client. Prevents silent hangs caused by
 * stalled TCP connections, region mismatches, or paused projects.
 *
 * 10s is chosen deliberately: real queries on our schema respond in
 * 100-800ms end to end, so anything taking >10s is broken, not slow.
 * Failing fast lets page-level loading flags flip to error state within
 * one browser-interaction window rather than spinning for ~minute-plus.
 */
function timeoutFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  // If the caller passed their own signal, chain them so either can abort.
  const callerSignal = init?.signal;
  let signal: AbortSignal = controller.signal;
  if (callerSignal) {
    // AbortSignal.any is available in modern Node/browsers; fall back to caller's signal
    // if not present (the controller timeout will still fire via its own signal path).
    const anyFn = (AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }).any;
    signal = anyFn ? anyFn([callerSignal, controller.signal]) : controller.signal;
  }

  return fetch(input, { ...init, signal }).finally(() => clearTimeout(timer));
}

export function getSupabaseBrowserClient(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  _client = createBrowserClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
    global: {
      fetch: timeoutFetch,
    },
  });
  return _client;
}

// Backward-compat: existing code imports `supabase` directly.
// Proxy defers creation until first property access (safe at build time).
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = getSupabaseBrowserClient();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
