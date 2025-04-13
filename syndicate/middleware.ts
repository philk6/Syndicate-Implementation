import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@lib/supabase/server';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') || req.cookies.get('sb-access-token')?.value;

  const supabase = createSupabaseServerClient(token);

  const { data: { session } } = await supabase.auth.getSession();

  const publicPaths = ['/login', '/signup', '/forgot-password'];

  if (!session && !publicPaths.some(path => req.nextUrl.pathname.startsWith(path))) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (session && (req.nextUrl.pathname === '/login' || req.nextUrl.pathname === '/signup')) {
    const url = req.nextUrl.clone();
    url.pathname = '/orders';
    return NextResponse.redirect(url);
  }

  if (req.nextUrl.pathname.startsWith('/admin')) {
    if (!session || !session.user) {
      const url = req.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('email', session.user.email)
      .single();

    if (userError || !userData || userData.role !== 'admin') {
      console.warn('Admin access denied:', { user: session.user.email, error: userError?.message, role: userData?.role });
      const url = req.nextUrl.clone();
      url.pathname = '/unauthorized';
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