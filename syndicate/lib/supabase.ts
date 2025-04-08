import { createClient } from '@supabase/supabase-js';

// --- Base Configuration ---
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;

if (!supabaseUrl) {
  // URL is critical, throw error if missing
  throw new Error('Missing Supabase URL environment variable (NEXT_PUBLIC_SUPABASE_URL). Check your .env file.');
}

// --- Client-side Configuration ---
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

if (!supabaseAnonKey) {
  console.warn(
    'Missing Supabase client-side environment variable (NEXT_PUBLIC_SUPABASE_ANON_KEY). Client-side features may fail. Check your .env file.'
  );
}

// Client-side Supabase client (uses anon key, RLS enforced based on user auth)
// Use this in client components and client-side scripts.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// --- Server-side Configuration (for user-context actions) ---
// This client uses the anon key but can be augmented with a user's JWT token.
// Useful for server components or actions that need user context but not admin rights.
export const supabaseServer = (token?: string) =>
    createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
      auth: {
        persistSession: false // Don't persist sessions on server
      }
    });

// --- Server-side Admin Configuration (for elevated privileges) ---
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

if (!supabaseServiceRoleKey && process.env.NODE_ENV !== 'development') {
    // In production/staging, service key is essential for admin tasks.
    // Throw an error to prevent the application from running without it.
    throw new Error(
      'FATAL ERROR: Missing Supabase server-side admin environment variable (SUPABASE_SERVICE_ROLE_KEY). Cannot perform admin actions. Check your environment variables.'
    );
} else if (!supabaseServiceRoleKey && process.env.NODE_ENV === 'development') {
    // In development, warn but allow fallback to anon key for easier setup.
    console.warn(
      'Warning: Missing Supabase server-side admin environment variable (SUPABASE_SERVICE_ROLE_KEY). Admin actions might fail if RLS is restrictive. Using anon key as fallback for development.'
    );
}

// Server-side Admin client (uses service_role key, bypasses RLS by default)
// Use this for server actions/API routes needing admin privileges.
// Fallback to anon key ONLY in development if service key is missing.
export const supabaseAdmin = createClient(
    supabaseUrl,
    // Use service key if available, otherwise fallback to anon key ONLY in dev
    supabaseServiceRoleKey || (process.env.NODE_ENV === 'development' ? supabaseAnonKey : ''),
    {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
        }
    }
);

// Final safety check: Ensure admin client isn't using anon key in non-dev if service key was missing.
if (!supabaseServiceRoleKey && process.env.NODE_ENV !== 'development') {
    // This state should ideally be unreachable due to the throw above, but added as safeguard.
    console.error("CRITICAL: supabaseAdmin initialized without Service Role Key outside development. Application should have terminated.");
    // Consider throwing again if somehow reached:
    // throw new Error('supabaseAdmin misconfiguration detected.');
} 