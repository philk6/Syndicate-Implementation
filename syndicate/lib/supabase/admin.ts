import { createClient } from '@supabase/supabase-js';

// --- Server-side Admin Configuration (for elevated privileges) ---

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
    // URL is still needed for the admin client
    throw new Error(
        'FATAL ERROR: Missing Supabase URL environment variable (NEXT_PUBLIC_SUPABASE_URL) needed for admin client. Check your server environment variables.'
    );
}

if (!supabaseServiceRoleKey) {
    // Service key is mandatory for the admin client.
    // No fallback to anon key, as this client is explicitly for admin tasks.
    // Throw an error to prevent the application from misconfiguring.
    throw new Error(
        'FATAL ERROR: Missing Supabase server-side admin environment variable (SUPABASE_SERVICE_ROLE_KEY). Cannot initialize admin client. Check your server environment variables.'
    );
}

// Server-side Admin client (uses service_role key, bypasses RLS by default)
// Use this ONLY for server actions/API routes needing admin privileges.
export const supabaseAdmin = createClient(
    supabaseUrl,
    supabaseServiceRoleKey,
    {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
        }
    }
); 