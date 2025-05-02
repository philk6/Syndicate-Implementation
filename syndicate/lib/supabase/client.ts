import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

if (!supabaseUrl) {
  // URL is critical, throw error if missing even on client
  throw new Error('Missing Supabase URL environment variable (NEXT_PUBLIC_SUPABASE_URL). Check your .env file and Next.js configuration.');
}

if (!supabaseAnonKey) {
  // Warn if anon key is missing on client, as it's needed for basic operations
  console.warn(
    'Missing Supabase client-side environment variable (NEXT_PUBLIC_SUPABASE_ANON_KEY). Client-side features may fail. Check your .env file and Next.js configuration.'
  );
  // Throw an error here too, as the client is likely unusable without the anon key.
  throw new Error('Missing Supabase Anon Key environment variable (NEXT_PUBLIC_SUPABASE_ANON_KEY). Check your .env file and Next.js configuration.');
}

// Client-side Supabase client with optimized settings
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  // Database connection settings
  db: {
    schema: 'public',
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  // Add global request timeout
  global: {
    fetch: (url, options) => {
      // Add a timeout to all fetch operations
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      return fetch(url, {
        ...options,
        signal: controller.signal
      }).finally(() => clearTimeout(timeoutId));
    }
  }
}); 