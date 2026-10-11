import type { NextAuthConfig } from 'next-auth';

export const authConfig: NextAuthConfig = {
  pages: {
    signIn: '/login',
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const pathname = nextUrl.pathname;

      // Public paths whitelist
      const isPublic =
        pathname === '/login' ||
        pathname === '/accept-invite' ||
        pathname === '/forgot-password' ||
        pathname === '/reset-password' ||
        pathname === '/healthz' ||
        pathname.startsWith('/api/auth');

      if (isPublic) {
        return true;
      }

      if (!isLoggedIn) {
        return false; // Redirect to /login
      }

      const userRole = (auth.user as { role?: string })?.role;

      // Admin route protection: strict server-side check
      if (pathname.startsWith('/admin')) {
        return userRole === 'ADMIN';
      }

      // Propose topic route protection: Invariant 1 (Admin can NEVER propose a topic)
      if (pathname === '/faculty/topics/new') {
        return userRole === 'FACULTY';
      }

      // General faculty routes
      if (pathname.startsWith('/faculty')) {
        return userRole === 'FACULTY';
      }

      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as unknown as { role: string }).role;
      }
      return token;
    },
    session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        (session.user as unknown as { role: string }).role = token.role as string;
      }
      return session;
    },
  },
  providers: [],
};
