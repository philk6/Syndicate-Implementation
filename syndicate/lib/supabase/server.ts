import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Lazy server client factory. Does not read env vars at module load
// so the module can be imported during `next build` without env vars.

export const createSupabaseServerClient = (token?: string): SupabaseClient => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Check server environment variables.',
    );
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    db: { schema: 'public' },
    global: {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      fetch: (url, options) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        return fetch(url, { ...options, signal: controller.signal }).finally(() =>
          clearTimeout(timeoutId),
        );
      },
    },
    auth: { persistSession: false },
  });
};
