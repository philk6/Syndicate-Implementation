import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@lib/supabase/server';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const { pathname } = req.nextUrl;

  // Define public paths that don't require authentication or ToS
  const publicPaths = ['/login', '/signup', '/forgot-password', '/confirm'];
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
    return NextResponse.next();
  }

  // Get token from headers or cookies
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') || req.cookies.get('sb-access-token')?.value;

  // Initialize Supabase client
  const supabase = createSupabaseServerClient(token);

  // Get session
  const { data: { session } } = await supabase.auth.getSession();

  // Handle public paths
  if (isPublicPath) {
    return NextResponse.next();
  }

  // Redirect to login if not authenticated
  if (!session || !session.user) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from login/signup to orders
  if (pathname === '/login' || pathname === '/signup') {
    const url = req.nextUrl.clone();
    url.pathname = '/orders';
    return NextResponse.redirect(url);
  }

  // Check admin access for /admin routes
  if (pathname.startsWith('/admin')) {
    console.log('Middleware: Checking admin access for user:', session.user.id);
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('user_id', session.user.id)
      .single();

    console.log('Middleware: User role check result:', { userData, userError, userId: session.user.id });

    if (userError || !userData || userData.role !== 'admin') {
      console.warn('Admin access denied:', { user: session.user.id, error: userError?.message, role: userData?.role });
      const url = req.nextUrl.clone();
      url.pathname = '/unauthorized';
      return NextResponse.redirect(url);
    }
    
    console.log('Middleware: Admin access granted for user:', session.user.id);
  }

  // For non-exempt paths, check ToS acceptance
  if (!isTosExemptPath) {
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('tos_accepted')
      .eq('user_id', session.user.id)
      .single();

    if (userError || !userData?.tos_accepted) {
      const url = req.nextUrl.clone();
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }
  }

  return res;
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|images|assets).*)',
  ],
};