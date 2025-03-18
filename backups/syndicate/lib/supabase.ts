import { createClient } from '@supabase/supabase-js';

// These should be environment variables in production
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

// Check if the environment variables are set
if (!supabaseUrl || !supabaseKey) {
  console.warn(
    'Missing Supabase environment variables. Check your .env file.'
  );
}

// Client-side Supabase client (uses anon key)
export const supabase = createClient(supabaseUrl, supabaseKey); 

// Server-side Supabase client (accepts a token for authenticated requests)
export const supabaseServer = (token?: string) =>
    createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
    });