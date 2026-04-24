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

  // Role-gated paths. Keys:
  //   /admin/*       — admin only (except carve-outs below)
  //   /admin/prep    — admin + employee + va (VA profile is checked on the page)
  //   /admin/teams   — admin only (covered by the default /admin rule)
  //   /my-time/*     — admin + employee + va (clock-in/out is shared)
  //   /my-team/*     — admin + one-on-one student (students manage their VAs)
  //   /orders        — buyer's-group only (admin or users.buyersgroup=true)
  //                    VAs and students are never in the buyer's group.
  const needsRole =
    pathname.startsWith('/admin') ||
    pathname.startsWith('/my-time') ||
    pathname.startsWith('/my-team') ||
    pathname === '/orders' || pathname.startsWith('/orders/');

  if (needsRole) {
    const { data: userData } = await supabase
      .from('users')
      .select('role, is_one_on_one_student, buyersgroup')
      .eq('user_id', user.id)
      .single();

    const role = userData?.role as 'admin' | 'user' | 'employee' | 'va' | undefined;
    const isStudent = Boolean(userData?.is_one_on_one_student);
    const inBuyersGroup = role === 'admin' || (Boolean(userData?.buyersgroup) && role !== 'va');

    const allowed = (() => {
      if (!role) return false;
      if (pathname === '/orders' || pathname.startsWith('/orders/')) return inBuyersGroup;
      if (pathname.startsWith('/my-time')) return role === 'admin' || role === 'employee' || role === 'va';
      if (pathname.startsWith('/my-team')) return role === 'admin' || isStudent;
      if (pathname.startsWith('/admin/prep')) {
        return role === 'admin' || role === 'employee' || role === 'va';
      }
      // /admin/* default: admin only
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
