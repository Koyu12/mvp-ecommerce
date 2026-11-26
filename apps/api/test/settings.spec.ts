import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { seedAdmin } from '../src/auth/seed';
import { PrismaService } from '../src/infra/prisma.service';
import { FakeGoogle } from './fakes';
import { createTestApp, TestApp } from './test-app';

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct-horse-battery';

describe('Store settings', () => {
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
    const ip = `10.3.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
    const agent = request.agent(t.app.getHttpServer());
    const auth = (path: string, body: object) =>
      agent.post(`/api/auth${path}`).set('Origin', ORIGIN).set('X-Forwarded-For', ip).send(body);
    return { agent, auth };
  };

  const signInAdmin = async () => {
    const email = `${randomUUID()}@example.com`;
    await seedAdmin(prisma, email);
    const { agent, auth } = client();
    const start = await auth('/sign-in/social', { provider: 'google', callbackURL: '/' }).expect(200);
    const state = new URL(start.body.url).searchParams.get('state')!;
    await agent.get(`/api/auth/callback/google?code=${google.codeFor({ sub: randomUUID(), email })}&state=${state}`).expect(302);
    return agent;
  };

  const signInCustomer = async () => {
    const email = `${randomUUID()}@example.com`;
    const { agent, auth } = client();
    const user = (await auth('/sign-up/email', { name: 'Ann Customer', email, password: PASSWORD }).expect(200)).body.user;
    await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } });
    await auth('/sign-in/email', { email, password: PASSWORD }).expect(200);
    return agent;
  };

  // Runs first: the only spec that writes settings, so the migrated default is still in place.
  it('starts with a default Shipping fee after migration', async () => {
    const admin = await signInAdmin();
    const res = await admin.get('/api/admin/settings').expect(200);
    expect(res.body).toEqual({ shippingFee: 15000 });
  });

  it('lets an Admin update the Shipping fee', async () => {
    const admin = await signInAdmin();

    const res = await admin.put('/api/admin/settings').send({ shippingFee: 20000 }).expect(200);
    expect(res.body).toEqual({ shippingFee: 20000 });

    expect((await admin.get('/api/admin/settings').expect(200)).body).toEqual({ shippingFee: 20000 });
  });

  it('refuses a Shipping fee that is not a whole, non-negative IDR amount', async () => {
    const admin = await signInAdmin();
    await admin.put('/api/admin/settings').send({ shippingFee: 25000 }).expect(200);

    for (const shippingFee of [-1, 1.5, '30000', null, 3_000_000_000]) {
      const res = await admin.put('/api/admin/settings').send({ shippingFee });
      expect(res.status, String(shippingFee)).toBe(400);
    }
    await admin.put('/api/admin/settings').send({}).expect(400);

    expect((await admin.get('/api/admin/settings').expect(200)).body).toEqual({ shippingFee: 25000 });
  });

  it('accepts free shipping', async () => {
    const admin = await signInAdmin();
    await admin.put('/api/admin/settings').send({ shippingFee: 0 }).expect(200);
    expect((await admin.get('/api/admin/settings').expect(200)).body).toEqual({ shippingFee: 0 });
  });

  it('refuses Guests with 401 and Customers with 403, leaving the fee unchanged', async () => {
    const admin = await signInAdmin();
    await admin.put('/api/admin/settings').send({ shippingFee: 18000 }).expect(200);
    const customer = await signInCustomer();

    await t.http().get('/api/admin/settings').expect(401);
    await t.http().put('/api/admin/settings').send({ shippingFee: 1 }).expect(401);
    await customer.get('/api/admin/settings').expect(403);
    await customer.put('/api/admin/settings').send({ shippingFee: 1 }).expect(403);

    expect((await admin.get('/api/admin/settings').expect(200)).body).toEqual({ shippingFee: 18000 });
  });
});
