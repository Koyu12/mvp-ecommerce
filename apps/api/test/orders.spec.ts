import { randomUUID } from 'node:crypto';
import { formatOrderNumber, orderTotal } from '@mvp/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../src/infra/prisma.service';
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

  beforeAll(async () => {
    t = await createTestApp();
    prisma = t.app.get(PrismaService);
  });
  afterAll(() => t.close());

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
});
