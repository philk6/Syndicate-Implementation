// --- Server-side Admin Configuration (for elevated privileges) ---
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

if (!supabaseServiceRoleKey && process.env.NODE_ENV !== 'development') {
    // In production/staging, service key is essential for admin tasks.
    // Log an error, but DO NOT throw to allow the build to complete.
    // The application will likely fail at runtime if the key isn't provided by the environment.
    console.error(
      'ERROR: Missing Supabase server-side admin environment variable (SUPABASE_SERVICE_ROLE_KEY). Admin actions will fail at runtime if the key is not provided by the deployment environment.'
    );
} else if (!supabaseServiceRoleKey && process.env.NODE_ENV === 'development') {
    // In development, warn but allow fallback to anon key for easier setup.
    console.warn(
      'Warning: Missing Supabase server-side admin environment variable (SUPABASE_SERVICE_ROLE_KEY). Admin actions might fail if RLS is restrictive. Using anon key as fallback for development.'
    );
}

// ... rest of the file (supabaseAdmin initialization) ... 