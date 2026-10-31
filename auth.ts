import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from './lib/prisma';
import { authConfig } from './auth.config';

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        loginRole: { label: 'Login Role', type: 'text' },
      },
      async authorize(credentials) {
        const parsed = z
          .object({
            email: z.string().email(),
            password: z.string().min(6),
            loginRole: z.enum(['FACULTY', 'ADMIN']).optional().default('FACULTY'),
          })
          .safeParse(credentials);

        if (!parsed.success) {
          return null;
        }

        const { email, password, loginRole } = parsed.data;

        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase() },
        });

        if (!user || !user.passwordHash || !user.active) {
          return null;
        }

        const passwordsMatch = await bcrypt.compare(password, user.passwordHash);
        if (!passwordsMatch) {
          return null;
        }

        // Only accounts with DB role ADMIN can sign in as ADMIN.
        // Both FACULTY and ADMIN accounts can sign in as FACULTY (Supervisor).
        if (loginRole === 'ADMIN' && user.role !== 'ADMIN') {
          return null;
        }

        const effectiveRole = loginRole === 'ADMIN' ? 'ADMIN' : 'FACULTY';

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: effectiveRole,
        };
      },
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  secret: process.env.AUTH_SECRET,
});
