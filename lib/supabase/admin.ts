import { createClient } from '@supabase/supabase-js';

// --- Base Configuration ---
// Must read URL from NEXT_PUBLIC_ even on server, as it's the same DB
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;

if (!supabaseUrl) {
  throw new Error('Missing Supabase URL environment variable (NEXT_PUBLIC_SUPABASE_URL). Check your .env file.');
}

// --- Server-side Admin Configuration (for elevated privileges) ---
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

if (!supabaseServiceRoleKey && process.env.NODE_ENV !== 'development') {
    // Log error but don't throw during build. Runtime will fail if key missing.
    console.error(
      'ERROR: Missing Supabase server-side admin environment variable (SUPABASE_SERVICE_ROLE_KEY). Admin actions will fail at runtime if the key is not provided by the deployment environment.'
    );
} else if (!supabaseServiceRoleKey && process.env.NODE_ENV === 'development') {
    console.warn(
      'Warning: Missing Supabase server-side admin environment variable (SUPABASE_SERVICE_ROLE_KEY) in development. Admin actions might fail if RLS is restrictive.'
    );
}

// Server-side Admin client (uses service_role key, bypasses RLS by default)
// Use this ONLY in server-side code (Server Actions, API routes).
export const supabaseAdmin = createClient(
    supabaseUrl,
    supabaseServiceRoleKey || '', // Pass empty string if missing; runtime will fail if needed & missing
    {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
        }
    }
); 