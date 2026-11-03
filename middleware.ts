import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from './auth.config';

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;
  const userRole = (req.auth?.user as { role?: string })?.role;
  const pathname = nextUrl.pathname;

  const isPublic =
    pathname === '/login' ||
    pathname === '/accept-invite' ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password' ||
    pathname === '/healthz' ||
    pathname === '/app-icon.png' ||
    pathname === '/icon.png' ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.ico') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.webp') ||
    pathname.startsWith('/api/auth');

  if (isPublic) {
    return NextResponse.next();
  }

  // Unauthenticated users redirect to /login
  if (!isLoggedIn) {
    const loginUrl = new URL('/login', nextUrl.origin);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Invariant 1: Faculty hitting an admin URL returns HTTP 403 Forbidden
  if (pathname.startsWith('/admin') && userRole !== 'ADMIN') {
    return new NextResponse('Forbidden: Faculty cannot access Admin Console (403)', {
      status: 403,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  // Invariant 2: Admin cannot open the Propose screens (returns HTTP 403 Forbidden)
  if (pathname === '/faculty/topics/new' && userRole === 'ADMIN') {
    return new NextResponse('Forbidden: Admin cannot propose project topics (403)', {
      status: 403,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
