import { createClient } from '@supabase/supabase-js';

// --- Base Configuration ---
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;

if (!supabaseUrl) {
  // URL is critical, throw error if missing locally or during build if possible
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
export const supabase = createClient(supabaseUrl, supabaseAnonKey || ''); // Provide a default empty string if key is missing 