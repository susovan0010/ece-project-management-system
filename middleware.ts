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

  // Invariant 1: Non-Admin hitting an admin URL returns HTTP 403 Forbidden
  if (pathname.startsWith('/admin') && userRole !== 'ADMIN') {
    return new NextResponse('Forbidden: Access restricted to Project Committee Admin (403)', {
      status: 403,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  // Invariant 2: Non-Faculty hitting a faculty URL returns HTTP 403 Forbidden
  // Admins who supervise groups or need to access the forum are permitted on /faculty/forum
  if (pathname.startsWith('/faculty') && userRole !== 'FACULTY') {
    if (pathname.startsWith('/faculty/forum') && userRole === 'ADMIN') {
      return NextResponse.next();
    }
    return new NextResponse('Forbidden: Access restricted to Faculty Supervisors (403)', {
      status: 403,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  // Invariant 3: Non-Student hitting a student URL returns HTTP 403 Forbidden
  if (pathname.startsWith('/student') && userRole !== 'STUDENT') {
    return new NextResponse('Forbidden: Access restricted to Enrolled Students (403)', {
      status: 403,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
