import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { admin } from 'better-auth/plugins';
import { adminAc, userAc } from 'better-auth/plugins/admin/access';
import { Clock } from './clock';
import { EmailQueue } from './email.queue';
import { PrismaService } from './prisma.service';

export const AUTH = Symbol('AUTH');

const FIFTEEN_MINUTES = 15 * 60 * 1000;

// Fixed-window counter per key; returns false once `max` hits land inside one window.
// shortcut: in-memory and per process like Better Auth's own limits; move to shared storage with them.
function windowLimiter(clock: Clock, max: number, windowMs: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (key: string): boolean => {
    const now = clock.now().getTime();
    // Keeps memory bounded when an attacker sprays many distinct emails.
    if (hits.size > 10_000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    return ++entry.count <= max;
  };
}

// Better Auth owns signup, login, verification and password reset under /api/auth/*.
export function createAuth(prisma: PrismaService, emails: EmailQueue, clock: Clock) {
  // IP limits alone fall to a spoofed X-Forwarded-For or many IPs; these cap guesses per account.
  const loginPerEmail = windowLimiter(clock, 10, FIFTEEN_MINUTES);
  const resetRequestPerEmail = windowLimiter(clock, 3, FIFTEEN_MINUTES);

  return betterAuth({
    // The web origin: email links and cookies go through the Next.js /api proxy (ADR 0001).
    baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    plugins: [
      // Adds `role` and the /admin/* routes (list-users, set-role, ...), open to Admins only.
      admin({ roles: { admin: adminAc, customer: userAc }, defaultRole: 'customer', adminRoles: ['admin'] }),
    ],
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      sendResetPassword: ({ user, url }) =>
        emails.enqueue({ to: user.email, subject: 'Reset your password', text: `Reset your password: ${url}` }),
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const email: unknown = ctx.body?.email;
        if (typeof email !== 'string') return;
        const key = email.trim().toLowerCase();

        if (ctx.path === '/sign-in/email') {
          if (!loginPerEmail(key)) throw new APIError('TOO_MANY_REQUESTS', { message: 'Too many login attempts' });
          // Admins sign in with Google only (ADR 0004); answer as for a wrong password so this doesn't reveal Admin emails.
          const user = await prisma.user.findUnique({ where: { email: key }, select: { role: true } });
          if (user?.role === 'admin') {
            throw new APIError('UNAUTHORIZED', { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' });
          }
        }
        if (ctx.path === '/request-password-reset' && !resetRequestPerEmail(key)) {
          throw new APIError('TOO_MANY_REQUESTS', { message: 'Too many reset requests' });
        }
      }),
    },
    advanced: {
      // The client IP for the limits below. The edge proxy in front of the web app must overwrite this
      // header with the real client address: Next.js keeps a client-sent value, so without that edge
      // a client can pick its own IP and only the per-email limits above still hold.
      ipAddress: { ipAddressHeaders: ['x-forwarded-for'] },
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
    account: {
      // Better Auth's default refuses to link Google to an unverified password account (see
      // docs/notes/4-google-linking.md). We link instead, and the hook below drops that password.
      accountLinking: { requireLocalEmailVerified: false },
    },
    databaseHooks: {
      account: {
        create: {
          // Pre-account takeover: a password set on an email nobody verified may belong to someone else,
          // so it stops working once the real owner proves the email through Google. Runs before
          // Better Auth marks the user verified, so `emailVerified: false` still identifies that case.
          after: async (account) => {
            if (account.providerId === 'credential') return;
            await prisma.account.deleteMany({
              where: { userId: account.userId, providerId: 'credential', user: { emailVerified: false } },
            });
          },
        },
      },
    },
    socialProviders: {
      // Google reports email_verified, so a new user arrives verified and links by email to an existing one.
      google: { clientId: process.env.GOOGLE_CLIENT_ID ?? '', clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '' },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail: ({ user, url }) =>
        emails.enqueue({ to: user.email, subject: 'Verify your email', text: `Verify your email: ${url}` }),
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
