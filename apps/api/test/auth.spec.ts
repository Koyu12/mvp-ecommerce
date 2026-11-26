import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../src/prisma.service';
import { seedAdmin } from '../src/seed';
import { createTestApp, TestApp } from './test-app';

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct-horse-battery';

describe('email/password accounts', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  // Each test gets its own client IP so rate limits don't leak between tests.
  const client = () => {
    const ip = `10.0.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
    const agent = request.agent(t.app.getHttpServer());
    const post = (path: string, body: object) =>
      agent.post(`/api/auth${path}`).set('Origin', ORIGIN).set('X-Forwarded-For', ip).send(body);
    // Opens a link from an email, as a browser would through the web origin.
    const visit = (link: URL) => agent.get(link.pathname + link.search).set('X-Forwarded-For', ip);
    return { post, visit };
  };

  const newEmail = () => `${randomUUID()}@example.com`;

  // Emails go through the BullMQ queue, so they arrive after the HTTP response.
  // Waits for the nth email to `email` matching `subject` and returns the link in it.
  const mailTo = async (email: string, subject: RegExp, nth = 1) => {
    let link = '';
    await vi.waitFor(() => {
      const mails = t.mailbox.sent.filter((m) => m.to === email && subject.test(String(m.subject)));
      expect(mails.length).toBeGreaterThanOrEqual(nth);
      link = /https?:\/\/\S+/.exec(String(mails[nth - 1].text))![0];
    });
    return new URL(link);
  };

  const signUp = (c: ReturnType<typeof client>, email: string) =>
    c.post('/sign-up/email', { name: 'Ann Customer', email, password: PASSWORD });

  it('signup creates a customer and queues a verification email', async () => {
    const c = client();
    const email = newEmail();

    const res = await signUp(c, email).expect(200);

    expect(res.body.user).toMatchObject({ email, emailVerified: false, role: 'customer' });
    const link = await mailTo(email, /verify/i);
    expect(link.pathname).toBe('/api/auth/verify-email');
  });

  it('sends email in the background: signup succeeds while SMTP is down, and the email is retried', async () => {
    const email = newEmail();
    t.mailbox.failNext = 1;

    await signUp(client(), email).expect(200);

    await vi.waitFor(() => expect(t.mailbox.sent.some((m) => m.to === email)).toBe(true), { timeout: 15_000 });
  });

  it('refuses login until the email is verified, then allows it', async () => {
    const c = client();
    const email = newEmail();
    await signUp(c, email).expect(200);

    const refused = await c.post('/sign-in/email', { email, password: PASSWORD }).expect(403);
    expect(refused.body.code).toBe('EMAIL_NOT_VERIFIED');

    const link = await mailTo(email, /verify/i);
    await c.visit(link).expect(302);

    const res = await c.post('/sign-in/email', { email, password: PASSWORD }).expect(200);
    expect(res.body.user).toMatchObject({ email, emailVerified: true });
  });

  it('resends the verification email, and the new link verifies', async () => {
    const c = client();
    const email = newEmail();
    await signUp(c, email).expect(200);
    await mailTo(email, /verify/i);

    await c.post('/send-verification-email', { email }).expect(200);

    await c.visit(await mailTo(email, /verify/i, 2)).expect(302);
    await c.post('/sign-in/email', { email, password: PASSWORD }).expect(200);
  });

  const verifiedCustomer = async () => {
    const c = client();
    const email = newEmail();
    await signUp(c, email).expect(200);
    await c.visit(await mailTo(email, /verify/i)).expect(302);
    return { c, email };
  };

  it('resets a forgotten password by email', async () => {
    const { c, email } = await verifiedCustomer();

    await c.post('/request-password-reset', { email, redirectTo: '/reset-password' }).expect(200);
    const link = await mailTo(email, /reset/i);
    const landing = await c.visit(link).expect(302);
    const token = new URL(landing.headers.location, ORIGIN).searchParams.get('token');

    await c.post('/reset-password', { token, newPassword: 'a-brand-new-password' }).expect(200);

    await c.post('/sign-in/email', { email, password: PASSWORD }).expect(401);
    await c.post('/sign-in/email', { email, password: 'a-brand-new-password' }).expect(200);
  });

  it('lets a logged-in customer change their password', async () => {
    const { c, email } = await verifiedCustomer();
    await c.post('/sign-in/email', { email, password: PASSWORD }).expect(200);

    await c.post('/change-password', { currentPassword: PASSWORD, newPassword: 'another-new-password' }).expect(200);

    await c.post('/sign-in/email', { email, password: PASSWORD }).expect(401);
    await c.post('/sign-in/email', { email, password: 'another-new-password' }).expect(200);
  });

  it('refuses email/password login for an Admin, who signs in with Google only (ADR 0004)', async () => {
    const { c, email } = await verifiedCustomer();
    await seedAdmin(t.app.get(PrismaService), email);

    const res = await c.post('/sign-in/email', { email, password: PASSWORD }).expect(401);
    expect(res.body.code).toBe('INVALID_EMAIL_OR_PASSWORD');
  });

  it('refuses change password without a session', async () => {
    await client().post('/change-password', { currentPassword: PASSWORD, newPassword: 'whatever-123' }).expect(401);
  });

  describe('rate limits', () => {
    const hammer = async (path: string, body: () => object) => {
      const c = client();
      const statuses: number[] = [];
      for (let i = 0; i < 12; i++) statuses.push((await c.post(path, body())).status);
      return statuses;
    };

    it.each([
      ['login', '/sign-in/email', () => ({ email: newEmail(), password: PASSWORD })],
      ['signup', '/sign-up/email', () => ({ name: 'Spam', email: newEmail(), password: PASSWORD })],
      ['password reset request', '/request-password-reset', () => ({ email: newEmail() })],
      ['password reset', '/reset-password', () => ({ token: 'bogus', newPassword: 'whatever-123' })],
    ])('returns 429 on %s past the limit', async (_name, path, body) => {
      const statuses = await hammer(path, body);

      expect(statuses.slice(0, 3)).not.toContain(429);
      expect(statuses.at(-1)).toBe(429);
    });

    it('limits each client IP separately', async () => {
      await hammer('/sign-in/email', () => ({ email: newEmail(), password: PASSWORD }));

      const res = await client().post('/sign-in/email', { email: newEmail(), password: PASSWORD });
      expect(res.status).toBe(401);
    });

    // A spoofed X-Forwarded-For gets a fresh IP limit on every request; the per-email limit still holds.
    it.each([
      ['login', '/sign-in/email', (email: string) => ({ email, password: 'wrong-password' })],
      ['password reset request', '/request-password-reset', (email: string) => ({ email })],
    ])('limits %s per email whatever the client IP, until the window passes', async (_name, path, body) => {
      const email = newEmail();
      const statuses: number[] = [];
      for (let i = 0; i < 12; i++) statuses.push((await client().post(path, body(email))).status);

      expect(statuses.slice(0, 3)).not.toContain(429);
      expect(statuses.at(-1)).toBe(429);

      t.clock.advance(15 * 60 * 1000);
      expect((await client().post(path, body(email))).status).not.toBe(429);
    });
  });
});
