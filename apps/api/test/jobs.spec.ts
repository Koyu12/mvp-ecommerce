import { createHash, randomUUID } from 'node:crypto';
import { PAYMENT_WINDOW_MS } from '@mvp/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../src/infra/prisma.service';
import { COMPLETION_WINDOW_MS, OrderCompletionProcessor } from '../src/jobs/order-completion.processor';
import { OrderExpiryProcessor } from '../src/jobs/order-expiry.processor';
import { createTestApp, TestApp } from './test-app';

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct-horse-battery';

describe('Unpaid Order expiry', () => {
  let t: TestApp;
  let prisma: PrismaService;
  let sweep: () => Promise<void>;

  beforeAll(async () => {
    t = await createTestApp();
    prisma = t.app.get(PrismaService);
    const job = t.app.get(OrderExpiryProcessor);
    sweep = () => job.sweep();
  });
  afterAll(() => t.close());

  const ADDRESS = { recipientName: 'Ann', phone: '0812', line1: 'Jl. Merdeka 1', city: 'Jakarta', region: 'DKI Jakarta', postalCode: '10110' };

  // A signed-in Customer with one pending Order of 2 units of a Variant that had 10 in Stock.
  const pendingOrder = async () => {
    const email = `${randomUUID()}@example.com`;
    const ip = `10.8.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
    const a = request.agent(t.app.getHttpServer());
    const auth = (path: string, body: object) => a.post(`/api/auth${path}`).set('Origin', ORIGIN).set('X-Forwarded-For', ip).send(body);
    const { body } = await auth('/sign-up/email', { name: 'Ann Customer', email, password: PASSWORD }).expect(200);
    await prisma.user.update({ where: { id: body.user.id }, data: { emailVerified: true } });
    await auth('/sign-in/email', { email, password: PASSWORD }).expect(200);
    const { body: address } = await a.post('/api/addresses').send(ADDRESS).expect(201);
    const category = await prisma.category.create({ data: { name: `Cat ${randomUUID()}` } });
    const product = await prisma.product.create({
      data: { name: 'Basic tee', description: 'A tee', categoryId: category.id, price: 75_000, variants: { create: { sku: `SKU-${randomUUID()}`, stock: 10 } } },
      include: { variants: true },
    });
    const variant = product.variants[0]!;
    await a.post('/api/cart/items').send({ variantId: variant.id, quantity: 2 }).expect(200);
    const { body: order } = await a.post('/api/orders').set('Idempotency-Key', randomUUID()).send({ addressId: address.id }).expect(201);
    const stock = async () => (await prisma.variant.findUniqueOrThrow({ where: { id: variant.id } })).stock;
    const status = async () => (await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status;
    expect(await stock()).toBe(8);
    return { a, email, order, stock, status };
  };
  const pastDeadline = () => t.clock.advance(PAYMENT_WINDOW_MS + 60_000);
  const mails = (to: string, subject: string) => t.mailbox.sent.filter((m) => m.to === to && String(m.subject).includes(subject));
  // Give any duplicate email job time to arrive before asserting there is none.
  const settle = () => new Promise((r) => setTimeout(r, 1_000));
  // A settlement notification for the Order, signed with the test server key from setup-env.ts.
  const notify = (order: { number: string; total: number }) => {
    const n = { transaction_status: 'settlement', status_code: '200', order_id: order.number, gross_amount: `${order.total}.00` };
    const signature_key = createHash('sha512').update(n.order_id + n.status_code + n.gross_amount + 'test-server-key').digest('hex');
    return request(t.app.getHttpServer()).post('/api/payments/notification').send({ ...n, signature_key });
  };

  it('expires an Order Midtrans has never seen (404) and returns its Stock', async () => {
    const o = await pendingOrder();
    pastDeadline();
    await sweep();
    expect(await o.status()).toBe('expired');
    expect(await o.stock()).toBe(10);
    await vi.waitFor(() => expect(mails(o.email, 'expired')).toHaveLength(1), { timeout: 15_000 });

    // The next run doesn't see it again: Stock comes back once and one email goes out.
    await sweep();
    await settle();
    expect(await o.stock()).toBe(10);
    expect(mails(o.email, 'expired')).toHaveLength(1);
  });

  it('leaves an Order alone until its payment deadline has passed', async () => {
    const o = await pendingOrder();
    t.clock.advance(PAYMENT_WINDOW_MS - 60_000);
    await sweep();
    expect(await o.status()).toBe('pending_payment');
    expect(await o.stock()).toBe(8);
  });

  it.each(['expire', 'cancel', 'deny'])('expires an Order whose payment ended with %s and returns its Stock', async (transaction_status) => {
    const o = await pendingOrder();
    t.payments.statuses.set(o.order.number, { transaction_status, gross_amount: `${o.order.total}.00` });
    pastDeadline();
    await sweep();
    expect(await o.status()).toBe('expired');
    expect(await o.stock()).toBe(10);
  });

  it('expires a still-pending payment at Midtrans, and the Order on the run after', async () => {
    const o = await pendingOrder();
    t.payments.statuses.set(o.order.number, { transaction_status: 'pending', gross_amount: `${o.order.total}.00` });
    pastDeadline();
    await sweep();
    expect(t.payments.expired.filter((n) => n === o.order.number)).toHaveLength(1);
    expect(await o.status()).toBe('pending_payment');
    expect(await o.stock()).toBe(8);

    // Midtrans now reports the expiry.
    t.payments.statuses.set(o.order.number, { transaction_status: 'expire', gross_amount: `${o.order.total}.00` });
    t.clock.advance(60_000);
    await sweep();
    expect(await o.status()).toBe('expired');
    expect(await o.stock()).toBe(10);
  });

  it.each([
    { transaction_status: 'settlement' },
    { transaction_status: 'capture', fraud_status: 'accept' },
  ])('pays an Order whose notification was lost ($transaction_status), keeping its Stock sold', async (paid) => {
    const o = await pendingOrder();
    t.payments.statuses.set(o.order.number, { ...paid, gross_amount: `${o.order.total}.00` });
    pastDeadline();
    await sweep();
    expect(await o.status()).toBe('paid');
    expect(await o.stock()).toBe(8);
    await vi.waitFor(() => expect(mails(o.email, 'Payment received')).toHaveLength(1), { timeout: 15_000 });

    // A late notification changes nothing.
    await notify(o.order).expect(200);
    await sweep();
    await settle();
    expect(mails(o.email, 'Payment received')).toHaveLength(1);
  });

  it('leaves an Order pending when Get Status reports it paid for the wrong amount, alerting the Admin once', async () => {
    const admin = await prisma.user.create({ data: { id: randomUUID(), name: 'Admin', email: `${randomUUID()}@example.com`, emailVerified: true, role: 'admin' } });
    const o = await pendingOrder();
    const alerts = () => t.mailbox.sent.filter((m) => String(m.to).includes(admin.email) && String(m.subject).includes(o.order.number));
    t.payments.statuses.set(o.order.number, { transaction_status: 'settlement', gross_amount: '1.00' });
    pastDeadline();
    await sweep();
    await vi.waitFor(() => expect(alerts()).toHaveLength(1), { timeout: 15_000 });

    // Every later run sees it again; the Admin is told once.
    await sweep();
    await settle();
    expect(alerts()).toHaveLength(1);
    expect(await o.status()).toBe('pending_payment');
    expect(await o.stock()).toBe(8);
  });

  it('leaves a card payment held for a fraud challenge pending', async () => {
    const o = await pendingOrder();
    t.payments.statuses.set(o.order.number, { transaction_status: 'capture', fraud_status: 'challenge', gross_amount: `${o.order.total}.00` });
    pastDeadline();
    await sweep();
    expect(await o.status()).toBe('pending_payment');
    expect(await o.stock()).toBe(8);
  });

  it('gives one status and releases Stock at most once when a payment and the job race', async () => {
    const orders = await Promise.all([1, 2, 3, 4, 5].map(() => pendingOrder()));
    // Midtrans says expired to the job while a settlement arrives at the same moment.
    for (const o of orders) t.payments.statuses.set(o.order.number, { transaction_status: 'expire', gross_amount: `${o.order.total}.00` });
    pastDeadline();
    await Promise.all([sweep(), sweep(), ...orders.map((o) => notify(o.order).expect(200))]);
    for (const o of orders) {
      const status = await o.status();
      expect(['paid', 'expired']).toContain(status);
      expect(await o.stock()).toBe(status === 'paid' ? 8 : 10);
    }
  });
});

describe('Shipped Order auto-complete', () => {
  let t: TestApp;
  let prisma: PrismaService;
  let sweep: () => Promise<void>;

  beforeAll(async () => {
    t = await createTestApp();
    prisma = t.app.get(PrismaService);
    const job = t.app.get(OrderCompletionProcessor);
    sweep = () => job.sweep();
  });
  afterAll(() => t.close());

  // An Order straight in the database with `status`, shipped at the clock's current time.
  // Fixtures skip checkout and shipping, which orders.spec.ts covers.
  const orderIn = async (status: 'paid' | 'shipped' | 'cancelled') => {
    const user = await prisma.user.create({ data: { id: randomUUID(), name: 'Ann', email: `${randomUUID()}@example.com`, emailVerified: true } });
    const { id } = await prisma.order.create({
      data: {
        number: `ORD-${randomUUID()}`,
        userId: user.id,
        idempotencyKey: randomUUID(),
        status,
        subtotal: 100_000,
        shippingFee: 0,
        total: 100_000,
        recipientName: 'Ann',
        phone: '0812',
        line1: 'Jl. Merdeka 1',
        city: 'Jakarta',
        region: 'DKI Jakarta',
        postalCode: '10110',
        createdAt: t.clock.now(),
        ...(status === 'shipped' && { courier: 'JNE', trackingNumber: 'JNE123', shippedAt: t.clock.now() }),
      },
    });
    return async () => (await prisma.order.findUniqueOrThrow({ where: { id } })).status;
  };

  it('completes exactly the shipped Orders shipped more than 7 days ago, once', async () => {
    const old = await orderIn('shipped');
    t.clock.advance(1);
    const recent = await orderIn('shipped');
    const paid = await orderIn('paid');
    const cancelled = await orderIn('cancelled');

    // Exactly 7 days since the first Order shipped: not more than 7 days yet.
    t.clock.advance(COMPLETION_WINDOW_MS - 1);
    await sweep();
    expect(await old()).toBe('shipped');

    t.clock.advance(1);
    await sweep();
    expect(await old()).toBe('completed');
    expect(await recent()).toBe('shipped');

    t.clock.advance(1);
    await sweep();
    await sweep();
    expect(await recent()).toBe('completed');
    expect(await paid()).toBe('paid');
    expect(await cancelled()).toBe('cancelled');
  });
});
