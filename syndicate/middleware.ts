import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresh session — writes updated cookies to response
  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Skip checks for API routes (handled separately)
  if (pathname.startsWith('/api/')) return response;

  const publicPaths = ['/login', '/signup', '/forgot-password', '/reset-password', '/confirm'];
  const isPublicPath = publicPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (isPublicPath) {
    if (user && (pathname === '/login' || pathname === '/signup')) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }
    return response;
  }

  // Protected routes: redirect to login if no session
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Role-gated paths: /admin/* is admin-only except /admin/prep which is
  // also visible to employees; /my-time/* is admin or employee only.
  const needsRole =
    pathname.startsWith('/admin') || pathname.startsWith('/my-time');

  if (needsRole) {
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('user_id', user.id)
      .single();

    const role = userData?.role as 'admin' | 'user' | 'employee' | undefined;

    const allowed = (() => {
      if (!role) return false;
      if (pathname.startsWith('/my-time')) return role === 'admin' || role === 'employee';
      if (pathname.startsWith('/admin/prep')) return role === 'admin' || role === 'employee';
      // /admin/* (default): admin only
      return role === 'admin';
    })();

    if (!allowed) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
