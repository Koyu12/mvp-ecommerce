import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../src/prisma.service';
import { seedAdmin } from '../src/seed';
import { FakeGoogle } from './fakes';
import { createTestApp, TestApp } from './test-app';

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct-horse-battery';

describe('Admins', () => {
  let t: TestApp;
  let prisma: PrismaService;
  const google = new FakeGoogle();

  beforeAll(async () => {
    vi.stubGlobal('fetch', google.wrap(globalThis.fetch));
    t = await createTestApp();
    prisma = t.app.get(PrismaService);
  });
  afterAll(async () => {
    await t.close();
    vi.unstubAllGlobals();
  });

  const client = () => {
    const ip = `10.2.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
    const agent = request.agent(t.app.getHttpServer());
    const post = (path: string, body: object) =>
      agent.post(`/api/auth${path}`).set('Origin', ORIGIN).set('X-Forwarded-For', ip).send(body);
    const get = (path: string) => agent.get(path).set('X-Forwarded-For', ip);
    return { post, get };
  };
  type Client = ReturnType<typeof client>;

  const newEmail = () => `${randomUUID()}@example.com`;

  const signInWithGoogle = async (c: Client, email: string) => {
    const start = await c.post('/sign-in/social', { provider: 'google', callbackURL: '/' }).expect(200);
    const state = new URL(start.body.url).searchParams.get('state')!;
    const code = google.codeFor({ sub: randomUUID(), email });
    await c.get(`/api/auth/callback/google?code=${code}&state=${state}`).expect(302);
    return (await c.get('/api/auth/get-session').expect(200)).body.user;
  };

  // A verified Customer with a password, signed in on the returned client.
  const signUpCustomer = async (email = newEmail()) => {
    const c = client();
    const user = (await c.post('/sign-up/email', { name: 'Ann Customer', email, password: PASSWORD }).expect(200)).body
      .user;
    await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } });
    await c.post('/sign-in/email', { email, password: PASSWORD }).expect(200);
    return { c, user, email };
  };

  const signInAdmin = async () => {
    const email = newEmail();
    await seedAdmin(prisma, email);
    const c = client();
    const user = await signInWithGoogle(c, email);
    return { c, user, email };
  };

  it('seeds the first Admin from an email, harmlessly when run twice, and Google sign-in links to it', async () => {
    const email = newEmail();

    await seedAdmin(prisma, email);
    await seedAdmin(prisma, email);

    const user = await signInWithGoogle(client(), email);
    expect(user).toMatchObject({ email, role: 'admin' });
    expect(await prisma.user.count({ where: { email } })).toBe(1);
  });

  it('refuses Admin routes to Guests with 401 and to Customers with 403', async () => {
    const { c: customer, user } = await signUpCustomer();

    await client().get('/api/auth/admin/list-users').expect(401);
    await customer.get('/api/auth/admin/list-users').expect(403);
    await customer.post('/admin/set-role', { userId: user.id, role: 'admin' }).expect(403);
    expect((await customer.get('/api/auth/get-session').expect(200)).body.user.role).toBe('customer');
  });

  it('lets an Admin list users and promote one, who can then sign in with Google only', async () => {
    const { c: admin } = await signInAdmin();
    const { user, email } = await signUpCustomer();

    const list = await admin.get(`/api/auth/admin/list-users?searchField=email&searchValue=${email}`).expect(200);
    expect(list.body.users).toEqual([expect.objectContaining({ id: user.id, email, role: 'customer' })]);

    await admin.post('/admin/set-role', { userId: user.id, role: 'admin' }).expect(200);

    const login = await client().post('/sign-in/email', { email, password: PASSWORD });
    expect(login.status).toBe(401);
    const viaGoogle = await signInWithGoogle(client(), email);
    expect(viaGoogle).toMatchObject({ id: user.id, role: 'admin' });
  });

  it('refuses password sign-in for a seeded Admin, even with a password set by reset', async () => {
    const { email } = await signInAdmin();
    await client().post('/request-password-reset', { email, redirectTo: '/reset-password' }).expect(200);
    let token = '';
    await vi.waitFor(() => {
      const mail = t.mailbox.sent.find((m) => m.to === email && /reset/i.test(String(m.subject)));
      token = new URL(/https?:\/\/\S+/.exec(String(mail?.text))![0]).pathname.split('/').pop()!;
    });
    await client().post('/reset-password', { token, newPassword: PASSWORD }).expect(200);

    const login = await client().post('/sign-in/email', { email, password: PASSWORD });

    expect(login.status).toBe(401);
    expect(login.body.code).toBe('INVALID_EMAIL_OR_PASSWORD');
  });
});
