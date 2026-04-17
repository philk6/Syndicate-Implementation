import { createClient, SupabaseClient } from '@supabase/supabase-js';

// --- Server-side Admin Configuration (for elevated privileges) ---
// Lazy-initialized: the client is created on first use, not at module load.
// This prevents the build from failing when SUPABASE_SERVICE_ROLE_KEY is
// not available in the build environment (it's only needed at runtime).

let _adminClient: SupabaseClient | null = null;

function getAdminClient(): SupabaseClient {
    if (_adminClient) return _adminClient;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl) {
        throw new Error(
            'Missing Supabase URL (NEXT_PUBLIC_SUPABASE_URL). Check server environment variables.'
        );
    }

    if (!supabaseServiceRoleKey) {
        throw new Error(
            'Missing SUPABASE_SERVICE_ROLE_KEY. Check server environment variables.'
        );
    }

    _adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
        },
    });

    return _adminClient;
}

// Proxy export: code that imports `supabaseAdmin` gets the lazy singleton.
// Compatible with existing usage: `supabaseAdmin.from(...)` just works.
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
    get(_target, prop, receiver) {
        const client = getAdminClient();
        const value = Reflect.get(client, prop, receiver);
        return typeof value === 'function' ? value.bind(client) : value;
    },
});
