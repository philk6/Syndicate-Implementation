import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const { pathname } = req.nextUrl;

  // Define public paths that don't require authentication or ToS
  const publicPaths = ['/login', '/signup', '/forgot-password', '/reset-password', '/confirm'];
  const isPublicPath = publicPaths.some(path => pathname === path || pathname.startsWith(`${path}/`));

  // Define paths exempt from ToS check (but still require authentication)
  const tosExemptPaths = ['/dashboard', '/account'];
  const isTosExemptPath = tosExemptPaths.some(path => pathname === path || pathname.startsWith(`${path}/`));

  // Skip middleware for API routes, static files, and images
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.match(/\.(jpg|jpeg|png|gif|svg|ico|css|js)$/)
  ) {
    return res;
  }

  // Create a Supabase client configured to use cookies
  const supabase = createMiddlewareClient({ req, res });

  // Refresh session if expired - required for Server Components
  const {
    data: { session },
    error: sessionError
  } = await supabase.auth.getSession();

  if (sessionError) {
    console.error('Middleware: Session error:', sessionError);
  }

  // Handle public paths
  if (isPublicPath) {
    // For reset-password, allow access even without session if it has recovery tokens
    if (pathname === '/reset-password') {
      const url = new URL(req.url);
      const hasRecoveryToken = url.searchParams.get('type') === 'recovery' || 
                              url.hash.includes('type=recovery');
      if (hasRecoveryToken) {
        return res;
      }
    }
    
    // If user is authenticated and tries to access login/signup, redirect to orders
    if (session && (pathname === '/login' || pathname === '/signup')) {
      const url = req.nextUrl.clone();
      url.pathname = '/orders';
      return NextResponse.redirect(url);
    }
    
    return res;
  }

  // Redirect to login if not authenticated
  if (!session || !session.user) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  const isAdminPath = pathname.startsWith('/admin');
  const needsDbCheck = isAdminPath || !isTosExemptPath;

  if (needsDbCheck) {
    // Single DB query covers both role (admin paths) and tos_accepted (non-admin paths).
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role, tos_accepted')
      .eq('user_id', session.user.id)
      .single();

    if (isAdminPath) {
      if (userError || !userData || userData.role !== 'admin') {
        console.warn('Middleware: Admin access denied:', {
          user: session.user.id,
          error: userError?.message,
          role: userData?.role,
        });
        const url = req.nextUrl.clone();
        url.pathname = '/unauthorized';
        return NextResponse.redirect(url);
      }
      console.log('Middleware: Admin access granted for user:', session.user.id);
      // Admin paths skip ToS check — return immediately
      return res;
    }

    // Non-admin, non-exempt paths: enforce ToS acceptance
    if (!userData?.tos_accepted) {
      console.log('Middleware: User has not accepted ToS, redirecting to dashboard');
      const url = req.nextUrl.clone();
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }
  }

  return res;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images (public images directory)
     * - assets (public assets directory)
     * And files with extensions (e.g., .png, .jpg, etc.)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|images|assets|.*\\..*|_next).*)',
  ],
};