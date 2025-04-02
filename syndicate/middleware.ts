import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { supabaseServer } from './lib/supabase';

export async function middleware(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');

  const publicPaths = ['/login', '/signup'];
  if (
    publicPaths.includes(req.nextUrl.pathname) ||
    req.nextUrl.pathname.startsWith('/api') ||
    req.nextUrl.pathname.startsWith('/_next') ||
    req.nextUrl.pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  if (!token) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const { data: { user }, error } = await supabaseServer(token).auth.getUser();

  if (error || !user) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // Check if the request is for an admin route
  if (req.nextUrl.pathname.startsWith('/admin')) {
    const { data: userData, error: userError } = await supabaseServer(token)
      .from('users')
      .select('role')
      .eq('email', user.email) // Assuming email is unique and links auth user to users table
      .single();

    if (userError || userData?.role !== 'admin') {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};