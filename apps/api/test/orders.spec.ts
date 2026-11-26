import { randomUUID } from 'node:crypto';
import { formatOrderNumber, orderTotal } from '@mvp/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { seedAdmin } from '../src/auth/seed';
import { PrismaService } from '../src/infra/prisma.service';
import { FakeGoogle } from './fakes';
import { createTestApp, TestApp } from './test-app';

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct-horse-battery';

describe('Order total', () => {
  it('is the sum of unit price times quantity plus the Shipping fee', () => {
    expect(orderTotal([{ unitPrice: 100_000, quantity: 3 }, { unitPrice: 120_000, quantity: 1 }], 15_000)).toBe(435_000);
    expect(orderTotal([], 15_000)).toBe(15_000);
  });
});

describe('Order number', () => {
  it('is ORD-YYYYMMDD-NNNN on the Jakarta date, padded to four digits', () => {
    expect(formatOrderNumber(new Date('2026-11-25T03:00:00Z'), 1)).toBe('ORD-20261125-0001');
    // 18:00 UTC is already the next day in Jakarta (UTC+7).
    expect(formatOrderNumber(new Date('2026-11-25T18:00:00Z'), 42)).toBe('ORD-20261126-0042');
    expect(formatOrderNumber(new Date('2026-11-25T03:00:00Z'), 12345)).toBe('ORD-20261125-12345');
  });
});

describe('Checkout and Orders', () => {
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

  const ADDRESS = { recipientName: 'Ann', phone: '0812', line1: 'Jl. Merdeka 1', city: 'Jakarta', region: 'DKI Jakarta', postalCode: '10110' };

  // A verified, signed-in Customer with one saved Address.
  const customer = async () => {
    const email = `${randomUUID()}@example.com`;
    const ip = `10.6.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
    const a = request.agent(t.app.getHttpServer());
    const auth = (path: string, body: object) => a.post(`/api/auth${path}`).set('Origin', ORIGIN).set('X-Forwarded-For', ip).send(body);
    const { body } = await auth('/sign-up/email', { name: 'Ann Customer', email, password: PASSWORD }).expect(200);
    await prisma.user.update({ where: { id: body.user.id }, data: { emailVerified: true } });
    await auth('/sign-in/email', { email, password: PASSWORD }).expect(200);
    const { body: address } = await a.post('/api/addresses').send(ADDRESS).expect(201);
    const addToCart = (variantId: string, quantity: number) => a.post('/api/cart/items').send({ variantId, quantity }).expect(200);
    const checkout = (key: string | null = randomUUID(), body: object = { addressId: address.id }) => {
      const req = a.post('/api/orders');
      return key === null ? req.send(body) : req.set('Idempotency-Key', key).send(body);
    };
    const mails = () => t.mailbox.sent.filter((m) => m.to === email && String(m.subject).startsWith('Order'));
    return { a, email, address, addToCart, checkout, mails };
  };

  // Fixtures go straight to the database; the Admin API that writes them is covered in catalog.spec.ts.
  const variant = async (opts: { productPrice?: number; price?: number | null; stock?: number; name?: string } = {}) => {
    const category = await prisma.category.create({ data: { name: `Cat ${randomUUID()}` } });
    const size = await prisma.optionType.create({ data: { name: `Size ${randomUUID()}`, values: { create: { value: 'M' } } }, include: { values: true } });
    const product = await prisma.product.create({
      data: {
        name: opts.name ?? 'Tee',
        description: 'A tee',
        categoryId: category.id,
        price: opts.productPrice ?? 100_000,
        optionTypes: { connect: { id: size.id } },
        variants: {
          create: { sku: `SKU-${randomUUID()}`, stock: opts.stock ?? 10, price: opts.price ?? null, optionValues: { connect: { id: size.values[0]!.id } } },
        },
      },
      include: { variants: true },
    });
    return product.variants[0]!;
  };
  const stockOf = async (id: string) => (await prisma.variant.findUniqueOrThrow({ where: { id } })).stock;
  const shippingFee = async () => (await prisma.storeSettings.findUniqueOrThrow({ where: { id: 1 } })).shippingFee;

  it('creates a pending Order from the Cart at database prices, reserves Stock and empties the Cart', async () => {
    const c = await customer();
    const tee = await variant({ productPrice: 100_000, stock: 5, name: 'Basic tee' });
    const xl = await variant({ productPrice: 100_000, price: 120_000, stock: 2 });
    await c.addToCart(tee.id, 3);
    await c.addToCart(xl.id, 1);
    const fee = await shippingFee();

    // Prices sent by the client are ignored.
    const { body: order } = await c
      .checkout(randomUUID(), { addressId: c.address.id, total: 1, shippingFee: 0, items: [{ variantId: tee.id, unitPrice: 1 }] })
      .expect(201);
    expect(order).toMatchObject({
      status: 'pending_payment',
      subtotal: 420_000,
      shippingFee: fee,
      total: 420_000 + fee,
      address: { ...ADDRESS, line2: null },
    });
    expect(order.number).toMatch(/^ORD-\d{8}-\d{4,}$/);
    expect(order.items).toEqual([
      { variantId: tee.id, productName: 'Basic tee', sku: tee.sku, options: ['M'], unitPrice: 100_000, quantity: 3, lineTotal: 300_000 },
      { variantId: xl.id, productName: 'Tee', sku: xl.sku, options: ['M'], unitPrice: 120_000, quantity: 1, lineTotal: 120_000 },
    ]);
    expect(await stockOf(tee.id)).toBe(2);
    expect(await stockOf(xl.id)).toBe(1);
    await c.a.get('/api/cart').expect(200).expect((r) => expect(r.body.items).toEqual([]));

    // Later Product, Address and fee edits don't change the Order.
    await prisma.product.update({ where: { id: tee.productId }, data: { name: 'Renamed', price: 1 } });
    await prisma.variant.update({ where: { id: xl.id }, data: { price: 2, sku: `NEW-${randomUUID()}` } });
    await c.a.patch(`/api/addresses/${c.address.id}`).send({ city: 'Bandung' }).expect(200);
    await prisma.storeSettings.update({ where: { id: 1 }, data: { shippingFee: fee + 1 } });
    try {
      await c.a.get(`/api/orders/${order.id}`).expect(200, order);
      await c.a.delete(`/api/addresses/${c.address.id}`).expect(204);
      await c.a.get(`/api/orders/${order.id}`).expect(200, order);
    } finally {
      await prisma.storeSettings.update({ where: { id: 1 }, data: { shippingFee: fee } });
    }

    await vi.waitFor(() => {
      expect(c.mails()).toHaveLength(1);
      expect(String(c.mails()[0]!.subject)).toContain(order.number);
    }, { timeout: 15_000 });
  });

  it('requires an Idempotency-Key', async () => {
    const c = await customer();
    const tee = await variant({ stock: 3 });
    await c.addToCart(tee.id, 1);
    await c.checkout(null).expect(400);
    await c.checkout('').expect(400);
    await c.checkout('x'.repeat(101)).expect(400);
    expect(await stockOf(tee.id)).toBe(3);
  });

  it('returns the same Order for a repeated key, sequential or concurrent, reserving Stock and emailing once', async () => {
    const c = await customer();
    const tee = await variant({ stock: 10 });
    await c.addToCart(tee.id, 2);
    const key = randomUUID();
    const { body: first } = await c.checkout(key).expect(201);
    // The Cart is empty now, so a repeat that ran checkout again would fail; it must answer with the first Order.
    await c.addToCart(tee.id, 1);
    const { body: again } = await c.checkout(key).expect(201);
    expect(again).toEqual(first);
    expect(await stockOf(tee.id)).toBe(8);
    await c.a.get('/api/cart').expect(200).expect((r) => expect(r.body.items).toHaveLength(1));

    // Five concurrent requests with a fresh key: one Order, and all five get it.
    const key2 = randomUUID();
    const results = await Promise.all(Array.from({ length: 5 }, () => c.checkout(key2)));
    expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);
    expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
    expect(await stockOf(tee.id)).toBe(7);
    const { body: orders } = await c.a.get('/api/orders').expect(200);
    expect(orders).toHaveLength(2);

    await vi.waitFor(() => expect(c.mails()).toHaveLength(2), { timeout: 15_000 });
    // Give any duplicate job time to arrive before asserting there is none.
    await new Promise((r) => setTimeout(r, 1_000));
    expect(c.mails()).toHaveLength(2);
  });

  it('sells the last unit to exactly one of ten concurrent checkouts', async () => {
    const last = await variant({ stock: 1 });
    const buyers = await Promise.all(Array.from({ length: 10 }, () => customer()));
    for (const b of buyers) await b.addToCart(last.id, 1);
    const results = await Promise.all(buyers.map((b) => b.checkout()));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(9);
    expect(await stockOf(last.id)).toBe(0);
    expect(await prisma.orderItem.count({ where: { variantId: last.id } })).toBe(1);
    const loser = results.find((r) => r.status === 409)!;
    expect(loser.body.shortItems).toEqual([expect.objectContaining({ variantId: last.id, requested: 1, available: 0 })]);
  });

  it('refuses the whole Cart when any item is short or Archived, listing them and changing nothing', async () => {
    const c = await customer();
    const fine = await variant({ stock: 10 });
    const short = await variant({ stock: 5 });
    const archived = await variant({ stock: 5 });
    await c.addToCart(fine.id, 2);
    await c.addToCart(short.id, 4);
    await c.addToCart(archived.id, 1);
    await prisma.variant.update({ where: { id: short.id }, data: { stock: 3 } });
    await prisma.variant.update({ where: { id: archived.id }, data: { archived: true } });

    const { body } = await c.checkout().expect(409);
    expect(body.shortItems).toHaveLength(2);
    expect(body.shortItems).toEqual(
      expect.arrayContaining([
        { variantId: short.id, sku: short.sku, productName: 'Tee', requested: 4, available: 3, archived: false },
        { variantId: archived.id, sku: archived.sku, productName: 'Tee', requested: 1, available: 0, archived: true },
      ]),
    );
    expect([await stockOf(fine.id), await stockOf(short.id), await stockOf(archived.id)]).toEqual([10, 3, 5]);
    await c.a.get('/api/orders').expect(200, []);
    await c.a.get('/api/cart').expect(200).expect((r) => expect(r.body.items).toHaveLength(3));
  });

  it("refuses an empty Cart and another Customer's Address", async () => {
    const c = await customer();
    const other = await customer();
    await c.checkout().expect(400);
    const tee = await variant({ stock: 3 });
    await c.addToCart(tee.id, 1);
    await c.checkout(randomUUID(), { addressId: other.address.id }).expect(404);
    await c.checkout(randomUUID(), {}).expect(400);
    expect(await stockOf(tee.id)).toBe(3);
  });

  it('lists a Customer their own Orders only, newest first', async () => {
    const ann = await customer();
    const bob = await customer();
    const tee = await variant({ stock: 10 });
    await ann.addToCart(tee.id, 1);
    const { body: older } = await ann.checkout().expect(201);
    t.clock.advance(60_000);
    await ann.addToCart(tee.id, 2);
    const { body: newer } = await ann.checkout().expect(201);

    const { body: list } = await ann.a.get('/api/orders').expect(200);
    expect(list).toEqual([
      { id: newer.id, number: newer.number, status: 'pending_payment', total: newer.total, createdAt: newer.createdAt },
      { id: older.id, number: older.number, status: 'pending_payment', total: older.total, createdAt: older.createdAt },
    ]);
    expect(newer.number).not.toBe(older.number);

    await bob.a.get('/api/orders').expect(200, []);
    await bob.a.get(`/api/orders/${older.id}`).expect(404);
    const guest = request(t.app.getHttpServer());
    await guest.get('/api/orders').expect(401);
    await guest.get(`/api/orders/${older.id}`).expect(401);
    await guest.post('/api/orders').set('Idempotency-Key', randomUUID()).send({ addressId: ann.address.id }).expect(401);
  });

  describe('Admin', () => {
    const signInAdmin = async () => {
      const email = `${randomUUID()}@example.com`;
      await seedAdmin(prisma, email);
      const a = request.agent(t.app.getHttpServer());
      const ip = `10.8.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
      const start = await a.post('/api/auth/sign-in/social').set('Origin', ORIGIN).set('X-Forwarded-For', ip).send({ provider: 'google', callbackURL: '/' }).expect(200);
      const state = new URL(start.body.url).searchParams.get('state')!;
      await a.get(`/api/auth/callback/google?code=${google.codeFor({ sub: randomUUID(), email })}&state=${state}`).expect(302);
      return a;
    };
    let admin: request.Agent;
    beforeAll(async () => {
      admin = await signInAdmin();
    });

    // A Customer's Order of 2 units of a fresh Variant (Stock 10 before checkout), moved straight to `status`.
    const order = async (status: 'pending_payment' | 'paid' | 'completed' | 'expired' = 'paid') => {
      const c = await customer();
      const tee = await variant({ stock: 10 });
      await c.addToCart(tee.id, 2);
      const { body } = await c.checkout().expect(201);
      if (status !== 'pending_payment') await prisma.order.update({ where: { id: body.id }, data: { status } });
      return { c, tee, order: { ...body, status } };
    };
    const SHIP = { courier: 'JNE', trackingNumber: 'JNE123' };

    it('refuses every Admin Order route to Guests with 401 and to Customers with 403', async () => {
      const { c } = await order();
      const guest = request(t.app.getHttpServer());
      const routes = [
        ['get', '/api/admin/orders'],
        ['get', '/api/admin/orders/x'],
        ['post', '/api/admin/orders/x/ship'],
        ['post', '/api/admin/orders/x/cancel'],
      ] as const;
      for (const [method, path] of routes) {
        await guest[method](path).expect(401);
        await c.a[method](path).expect(403);
      }
    });

    it('lists Orders newest first, filtered by Order status and Jakarta date, with the Customer', async () => {
      t.clock.set(new Date('2026-03-10T05:00:00Z'));
      const a = await order('paid');
      // 18:00 UTC is already 11 March in Jakarta.
      t.clock.set(new Date('2026-03-10T18:00:00Z'));
      const b = await order('pending_payment');
      const c = await order('paid');

      const list = async (query: string) => (await admin.get(`/api/admin/orders?${query}`).expect(200)).body as { id: string }[];
      const ids = (rows: { id: string }[]) => rows.map((r) => r.id).filter((id) => [a, b, c].some((o) => o.order.id === id));

      expect(ids(await list(''))).toEqual([c.order.id, b.order.id, a.order.id]);
      expect(ids(await list('status=paid'))).toEqual([c.order.id, a.order.id]);
      expect(ids(await list('from=2026-03-11&to=2026-03-11'))).toEqual([c.order.id, b.order.id]);
      expect(ids(await list('to=2026-03-10'))).toEqual([a.order.id]);
      expect(ids(await list('status=paid&from=2026-03-11'))).toEqual([c.order.id]);
      const [row] = await list(`status=paid&from=2026-03-10&to=2026-03-10`);
      expect(row).toEqual({
        id: a.order.id,
        number: a.order.number,
        status: 'paid',
        total: a.order.total,
        createdAt: '2026-03-10T05:00:00.000Z',
        customer: { name: 'Ann Customer', email: a.c.email },
      });
      await admin.get('/api/admin/orders?status=lost').expect(400);
      await admin.get('/api/admin/orders?from=10-03-2026').expect(400);
    });

    it('shows Order detail: Customer, items, Address and payment info', async () => {
      const { c, order: o } = await order('pending_payment');
      const { body } = await admin.get(`/api/admin/orders/${o.id}`).expect(200);
      expect(body).toEqual({
        ...o,
        customer: { name: 'Ann Customer', email: c.email },
        shipment: null,
      });
      expect(body.paymentUrl).toBe(`https://pay.test/${o.number}`);
      await admin.get('/api/admin/orders/nope').expect(404);
    });

    const mailsAbout = (c: { email: string }, word: string) => t.mailbox.sent.filter((m) => m.to === c.email && String(m.subject).includes(word));
    // Waits for `n` emails, then gives any duplicate job time to arrive before asserting there is none.
    const expectMails = async (c: { email: string }, word: string, n: number) => {
      await vi.waitFor(() => expect(mailsAbout(c, word)).toHaveLength(n), { timeout: 15_000 });
      await new Promise((r) => setTimeout(r, 1_000));
      expect(mailsAbout(c, word)).toHaveLength(n);
    };

    it('ships a paid Order with courier and tracking number once, emailing the Customer once', async () => {
      const { c, order: o } = await order('paid');
      await admin.post(`/api/admin/orders/${o.id}/ship`).send({ courier: 'JNE' }).expect(400);
      await admin.post(`/api/admin/orders/${o.id}/ship`).send({ courier: ' ', trackingNumber: 'X' }).expect(400);

      t.clock.set(new Date('2026-04-01T02:00:00Z'));
      const { body: shipped } = await admin.post(`/api/admin/orders/${o.id}/ship`).send(SHIP).expect(200);
      expect(shipped).toMatchObject({ id: o.id, status: 'shipped', shipment: { ...SHIP, shippedAt: '2026-04-01T02:00:00.000Z' } });

      // A repeat answers with the current Order and changes nothing.
      t.clock.advance(60_000);
      await admin.post(`/api/admin/orders/${o.id}/ship`).send({ courier: 'SiCepat', trackingNumber: 'OTHER' }).expect(200, shipped);
      await admin.get(`/api/admin/orders/${o.id}`).expect(200, shipped);
      await c.a.get(`/api/orders/${o.id}`).expect(200).expect((r) => expect(r.body.shipment).toEqual(shipped.shipment));

      await expectMails(c, 'shipped', 1);
      expect(String(mailsAbout(c, 'shipped')[0]!.text)).toContain('JNE123');
    });

    it('refuses to ship an Order that is not paid', async () => {
      for (const status of ['pending_payment', 'expired'] as const) {
        const { c, order: o } = await order(status);
        await admin.post(`/api/admin/orders/${o.id}/ship`).send(SHIP).expect(409);
        await admin.get(`/api/admin/orders/${o.id}`).expect(200).expect((r) => expect(r.body).toMatchObject({ status, shipment: null }));
        expect(mailsAbout(c, 'shipped')).toHaveLength(0);
      }
      await admin.post('/api/admin/orders/nope/ship').send(SHIP).expect(404);
    });

    it('cancels a pending or paid Order once, returning its Stock and emailing the Customer once', async () => {
      for (const status of ['pending_payment', 'paid'] as const) {
        const { c, tee, order: o } = await order(status);
        expect(await stockOf(tee.id)).toBe(8);
        const { body: cancelled } = await admin.post(`/api/admin/orders/${o.id}/cancel`).expect(200);
        expect(cancelled).toMatchObject({ id: o.id, status: 'cancelled' });
        expect(await stockOf(tee.id)).toBe(10);

        // A repeat answers with the current Order and returns no more Stock.
        await admin.post(`/api/admin/orders/${o.id}/cancel`).expect(200, cancelled);
        expect(await stockOf(tee.id)).toBe(10);
        await admin.post(`/api/admin/orders/${o.id}/ship`).send(SHIP).expect(409);
        await expectMails(c, 'cancelled', 1);
      }
    });

    it('releases Stock exactly once when cancels race', async () => {
      const { tee, order: o } = await order('paid');
      const results = await Promise.all(Array.from({ length: 5 }, () => admin.post(`/api/admin/orders/${o.id}/cancel`)));
      expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
      expect(await stockOf(tee.id)).toBe(10);
    });

    it('refuses to cancel a shipped, completed or expired Order, keeping its Stock out', async () => {
      const { c, tee, order: o } = await order('paid');
      await admin.post(`/api/admin/orders/${o.id}/ship`).send(SHIP).expect(200);
      await admin.post(`/api/admin/orders/${o.id}/cancel`).expect(409);
      for (const status of ['completed', 'expired'] as const) {
        const other = await order(status);
        await admin.post(`/api/admin/orders/${other.order.id}/cancel`).expect(409);
        expect(await stockOf(other.tee.id)).toBe(8);
      }
      await admin.get(`/api/admin/orders/${o.id}`).expect(200).expect((r) => expect(r.body.status).toBe('shipped'));
      expect(await stockOf(tee.id)).toBe(8);
      expect(mailsAbout(c, 'cancelled')).toHaveLength(0);
      await admin.post('/api/admin/orders/nope/cancel').expect(404);
    });
  });
});
