import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { supabaseServer } from './lib/supabase';

export async function middleware(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');

  const publicPaths = ['/login', '/signup'];
  if (publicPaths.includes(req.nextUrl.pathname)) {
    return NextResponse.next();
  }

  if (!token) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const { data: { user }, error } = await supabaseServer(token).auth.getUser();

  if (error || !user) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};