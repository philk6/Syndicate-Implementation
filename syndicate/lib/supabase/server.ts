import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
    throw new Error(
        'Missing Supabase URL environment variable (NEXT_PUBLIC_SUPABASE_URL) needed for server client. Check your environment variables.'
    );
}

if (!supabaseAnonKey) {
    // Server client still needs anon key
    throw new Error(
        'Missing Supabase Anon Key environment variable (NEXT_PUBLIC_SUPABASE_ANON_KEY) needed for server client. Check your environment variables.'
    );
}

/**
 * Creates a Supabase client for server-side operations.
 * Uses the anon key but can be augmented with a user's JWT token for RLS.
 * @param token Optional user JWT token.
 * @returns Supabase client instance.
 */
export const createSupabaseServerClient = (token?: string) =>
    createClient(supabaseUrl, supabaseAnonKey, {
        global: {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
        auth: {
            persistSession: false // Don't persist sessions on server
        }
    }); 