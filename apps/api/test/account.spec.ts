import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../src/prisma.service';
import { createTestApp, TestApp } from './test-app';

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct-horse-battery';

describe('Customer profile and Address book', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  // Signs up, verifies and logs in a fresh Customer; returns an agent holding their session cookie.
  const customer = async () => {
    const ip = `10.1.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
    const agent = request.agent(t.app.getHttpServer());
    const email = `${randomUUID()}@example.com`;
    const auth = (path: string, body: object) =>
      agent.post(`/api/auth${path}`).set('Origin', ORIGIN).set('X-Forwarded-For', ip).send(body).expect(200);

    await auth('/sign-up/email', { name: 'Ann Customer', email, password: PASSWORD });
    let link = '';
    await vi.waitFor(() => {
      const mail = t.mailbox.sent.find((m) => m.to === email);
      expect(mail).toBeDefined();
      link = /https?:\/\/\S+/.exec(String(mail!.text))![0];
    });
    const url = new URL(link);
    await agent.get(url.pathname + url.search).expect(302);
    await auth('/sign-in/email', { email, password: PASSWORD });
    return { agent, email };
  };

  describe('profile', () => {
    it('shows and edits the Customer name and phone', async () => {
      const { agent, email } = await customer();

      const before = await agent.get('/api/profile').expect(200);
      expect(before.body).toEqual({ name: 'Ann Customer', email, phone: null });

      const res = await agent.patch('/api/profile').send({ name: 'Ann Smith', phone: '+62 812 3456 7890' }).expect(200);
      expect(res.body).toEqual({ name: 'Ann Smith', email, phone: '+62 812 3456 7890' });

      const after = await agent.get('/api/profile').expect(200);
      expect(after.body).toEqual({ name: 'Ann Smith', email, phone: '+62 812 3456 7890' });
    });

    it('refuses a blank name', async () => {
      const { agent } = await customer();
      await agent.patch('/api/profile').send({ name: '  ' }).expect(400);
    });

    it('refuses a Guest', async () => {
      await t.http().get('/api/profile').expect(401);
      await t.http().patch('/api/profile').send({ name: 'X' }).expect(401);
    });
  });

  const home = {
    recipientName: 'Ann Smith',
    phone: '+62 812 3456 7890',
    line1: 'Jl. Merdeka 1',
    line2: null,
    city: 'Bandung',
    region: 'Jawa Barat',
    postalCode: '40111',
  };
  const office = { ...home, line1: 'Jl. Asia Afrika 8', line2: 'Floor 3', postalCode: '40112' };

  describe('address book', () => {
    it('adds, lists, edits and deletes several Addresses', async () => {
      const { agent } = await customer();

      const a = await agent.post('/api/addresses').send(home).expect(201);
      expect(a.body).toMatchObject(home);
      const b = await agent.post('/api/addresses').send(office).expect(201);

      const list = await agent.get('/api/addresses').expect(200);
      expect(list.body).toEqual([expect.objectContaining(home), expect.objectContaining(office)]);

      const edited = await agent.patch(`/api/addresses/${a.body.id}`).send({ city: 'Jakarta', line2: 'Unit 5' }).expect(200);
      expect(edited.body).toMatchObject({ ...home, city: 'Jakarta', line2: 'Unit 5' });
      await agent.get(`/api/addresses/${a.body.id}`).expect(200).expect((res) => expect(res.body.city).toBe('Jakarta'));

      await agent.delete(`/api/addresses/${b.body.id}`).expect(204);
      await agent.get(`/api/addresses/${b.body.id}`).expect(404);
      const after = await agent.get('/api/addresses').expect(200);
      expect(after.body.map((x: { id: string }) => x.id)).toEqual([a.body.id]);
    });

    it('refuses an Address missing a required field', async () => {
      const { agent } = await customer();
      await agent.post('/api/addresses').send({ ...home, city: '' }).expect(400);
      await agent.post('/api/addresses').send({ ...home, line1: undefined }).expect(400);
      await agent.get('/api/addresses').expect(200, []);
    });

    it("never lets a Customer see or change another Customer's Addresses", async () => {
      const ann = await customer();
      const bob = await customer();
      const { body: annHome } = await ann.agent.post('/api/addresses').send(home).expect(201);
      const url = `/api/addresses/${annHome.id}`;

      await bob.agent.get('/api/addresses').expect(200, []);
      await bob.agent.get(url).expect(404);
      await bob.agent.patch(url).send({ city: 'Hacked' }).expect(404);
      await bob.agent.delete(url).expect(404);

      // Ann's Address is untouched.
      const mine = await ann.agent.get(url).expect(200);
      expect(mine.body).toMatchObject(home);
    });

    it('ignores a userId or id sent in the body', async () => {
      const ann = await customer();
      const bob = await customer();
      const { body: bobHome } = await bob.agent.post('/api/addresses').send(home).expect(201);
      const ids = async (c: typeof ann) => (await c.agent.get('/api/addresses').expect(200)).body.map((x: { id: string }) => x.id);
      const bobId = (await t.app.get(PrismaService).address.findUniqueOrThrow({ where: { id: bobHome.id } })).userId;

      const { body: annHome } = await ann.agent.post('/api/addresses').send({ ...home, userId: bobId, id: bobHome.id }).expect(201);
      await ann.agent.patch(`/api/addresses/${annHome.id}`).send({ userId: bobId, id: bobHome.id }).expect(200);

      expect(annHome.id).not.toBe(bobHome.id);
      expect(await ids(ann)).toEqual([annHome.id]);
      expect(await ids(bob)).toEqual([bobHome.id]);
    });

    it('refuses a Guest', async () => {
      await t.http().get('/api/addresses').expect(401);
      await t.http().post('/api/addresses').send(home).expect(401);
    });
  });
});
