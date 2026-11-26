import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { EmailQueue } from './email.queue';
import { PrismaService } from './prisma.service';

export const AUTH = Symbol('AUTH');

// Better Auth owns signup, login, verification and password reset under /api/auth/*.
export function createAuth(prisma: PrismaService, emails: EmailQueue) {
  return betterAuth({
    // The web origin: email links and cookies go through the Next.js /api proxy (ADR 0001).
    baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    user: {
      additionalFields: {
        role: { type: 'string', defaultValue: 'customer', input: false },
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      sendResetPassword: ({ user, url }) =>
        emails.enqueue({ to: user.email, subject: 'Reset your password', text: `Reset your password: ${url}` }),
    },
    rateLimit: {
      // On in every environment (Better Auth's default is production only), so tests see real limits.
      enabled: true,
      // shortcut: in-memory counters reset on restart and are per process; move to `customStorage` on Redis or `storage: 'database'` when the API runs more than one instance.
      storage: 'memory',
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/sign-up/email': { window: 60, max: 5 },
        '/request-password-reset': { window: 60, max: 3 },
        '/reset-password': { window: 60, max: 5 },
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail: ({ user, url }) =>
        emails.enqueue({ to: user.email, subject: 'Verify your email', text: `Verify your email: ${url}` }),
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
