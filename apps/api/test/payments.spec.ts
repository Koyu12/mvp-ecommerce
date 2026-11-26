import { createHash, randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../src/infra/prisma.service';
import { isPaidStatus, notificationSignature, snapTransaction } from '../src/payments/midtrans';
import { createTestApp, TestApp } from './test-app';

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct-horse-battery';
// Matches MIDTRANS_SERVER_KEY in setup-env.ts.
const SERVER_KEY = 'test-server-key';

describe('Midtrans notification signature', () => {
  it('is the SHA512 hex of order_id, status_code, gross_amount and the server key, as sent', () => {
    // Expected value computed with `sha512sum`.
    const n = { order_id: 'ORD-20261126-0001', status_code: '200', gross_amount: '160000.00' };
    expect(notificationSignature(n, 'SB-Mid-server-test')).toBe(
      'fca94e0ef1fb206d29b105dff2e12014dd50e917e753887d6e00ed578b2f791a62fe65e00fb9c156acfc335c763a3b5accfa169eae390be515322bfaa0cfa767',
    );
    // The raw string is signed, so a reformatted amount gives another signature.
    expect(notificationSignature({ ...n, gross_amount: '160000' }, 'SB-Mid-server-test')).toMatch(/^78de0c36a727cf64/);
  });
});

describe('Paid status', () => {
  it('is settlement, or capture that passed the fraud check', () => {
    expect(isPaidStatus({ transaction_status: 'settlement' })).toBe(true);
    expect(isPaidStatus({ transaction_status: 'capture', fraud_status: 'accept' })).toBe(true);
    expect(isPaidStatus({ transaction_status: 'capture', fraud_status: 'challenge' })).toBe(false);
    expect(isPaidStatus({ transaction_status: 'capture' })).toBe(false);
    for (const s of ['pending', 'deny', 'cancel', 'expire', 'failure', 'refund']) expect(isPaidStatus({ transaction_status: s })).toBe(false);
  });
});

describe('Snap transaction body', () => {
  it('starts the expiry at Order creation in WIB, truncates names to 50 and keeps items summing to the total', () => {
    const body = snapTransaction({
      orderNumber: 'ORD-20261126-0001',
      total: 160_000,
      items: [
        { id: 'SKU-1', name: 'x'.repeat(60), price: 75_000, quantity: 2 },
        { id: 'SHIPPING', name: 'Shipping fee', price: 10_000, quantity: 1 },
      ],
      customer: { name: 'Budi', email: 'budi@example.com', phone: '0812' },
      startTime: new Date('2026-11-26T07:05:00Z'),
      expiryMinutes: 30,
      finishUrl: 'http://localhost:3000/orders/o1',
    });
    expect(body).toEqual({
      transaction_details: { order_id: 'ORD-20261126-0001', gross_amount: 160_000 },
      item_details: [
        { id: 'SKU-1', name: 'x'.repeat(50), price: 75_000, quantity: 2 },
        { id: 'SHIPPING', name: 'Shipping fee', price: 10_000, quantity: 1 },
      ],
      customer_details: { first_name: 'Budi', email: 'budi@example.com', phone: '0812' },
      expiry: { start_time: '2026-11-26 14:05:00 +0700', unit: 'minutes', duration: 30 },
      callbacks: { finish: 'http://localhost:3000/orders/o1' },
    });
  });
});

describe('Payment', () => {
  let t: TestApp;
  let prisma: PrismaService;

  beforeAll(async () => {
    t = await createTestApp();
    prisma = t.app.get(PrismaService);
  });
  afterAll(() => t.close());

  const ADDRESS = { recipientName: 'Ann', phone: '0812', line1: 'Jl. Merdeka 1', city: 'Jakarta', region: 'DKI Jakarta', postalCode: '10110' };

  // A signed-in Customer with one Address and one Variant in the Cart.
  const customer = async () => {
    const email = `${randomUUID()}@example.com`;
    const ip = `10.7.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
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
    const checkout = (key = randomUUID()) => a.post('/api/orders').set('Idempotency-Key', key).send({ addressId: address.id });
    const mails = (subject: string) => t.mailbox.sent.filter((m) => m.to === email && String(m.subject).startsWith(subject));
    return { a, email, variant, checkout, mails };
  };

  // A Midtrans notification for the Order, signed with the test server key; `after` changes fields after signing.
  const notify = (order: { number: string; total: number }, fields: Record<string, string> = {}, after: Record<string, string> = {}) => {
    const n = {
      transaction_time: '2026-01-01 07:10:00',
      transaction_status: 'settlement',
      transaction_id: randomUUID(),
      status_message: 'midtrans payment notification',
      status_code: '200',
      payment_type: 'bank_transfer',
      order_id: order.number,
      gross_amount: `${order.total}.00`,
      currency: 'IDR',
      ...fields,
    };
    const signature_key = createHash('sha512').update(n.order_id + n.status_code + n.gross_amount + SERVER_KEY).digest('hex');
    // No session: Midtrans calls this route directly.
    return request(t.app.getHttpServer()).post('/api/payments/notification').send({ ...n, signature_key, ...after });
  };
  const statusOf = async (id: string) => (await prisma.order.findUniqueOrThrow({ where: { id } })).status;
  // Give any duplicate job time to arrive before asserting there is none.
  const settle = () => new Promise((r) => setTimeout(r, 1_000));

  it('creates a Snap payment expiring 30 minutes after Order creation, and returns its redirect for "pay now"', async () => {
    const c = await customer();
    const key = randomUUID();
    const { body: order } = await c.checkout(key).expect(201);
    expect(order.paymentUrl).toBe(`https://pay.test/${order.number}`);
    const request = t.payments.requests.find((r) => r.orderNumber === order.number)!;
    expect(request).toMatchObject({
      total: order.total,
      startTime: new Date(order.createdAt),
      expiryMinutes: 30,
      customer: { name: 'Ann', email: c.email, phone: '0812' },
      finishUrl: `http://localhost:3000/orders/${order.id}`,
      items: [
        { id: c.variant.sku, name: 'Basic tee', price: 75_000, quantity: 2 },
        { id: 'SHIPPING', name: 'Shipping fee', price: order.shippingFee, quantity: 1 },
      ],
    });
    expect(request.items.reduce((sum, i) => sum + i.price * i.quantity, 0)).toBe(order.total);

    // The pending Order keeps its link; a repeated checkout doesn't start a second payment.
    await c.a.get(`/api/orders/${order.id}`).expect(200).expect((r) => expect(r.body.paymentUrl).toBe(order.paymentUrl));
    await c.checkout(key).expect(201);
    expect(t.payments.requests.filter((r) => r.orderNumber === order.number)).toHaveLength(1);
  });

  it('answers 502 when the gateway fails, and a retry with the same key starts the payment', async () => {
    const c = await customer();
    const key = randomUUID();
    t.payments.failNext = 1;
    await c.checkout(key).expect(502);
    const { body: order } = await c.checkout(key).expect(201);
    expect(order.paymentUrl).toBe(`https://pay.test/${order.number}`);
  });

  it('marks the Order paid on a valid settlement and queues both emails once', async () => {
    const admin = await prisma.user.create({ data: { id: randomUUID(), name: 'Admin', email: `${randomUUID()}@example.com`, emailVerified: true, role: 'admin' } });
    const adminMails = (number: string) => t.mailbox.sent.filter((m) => String(m.to).includes(admin.email) && String(m.subject).includes(number));
    const c = await customer();
    const { body: order } = await c.checkout().expect(201);

    await notify(order).expect(200);
    expect(await statusOf(order.id)).toBe('paid');
    await vi.waitFor(() => {
      expect(c.mails('Payment received')).toHaveLength(1);
      expect(adminMails(order.number)).toHaveLength(1);
    }, { timeout: 15_000 });

    // Midtrans may send the same notification again: nothing changes and no second email goes out.
    await notify(order).expect(200);
    await notify(order, { transaction_status: 'pending', status_code: '201' }).expect(200);
    await settle();
    expect(await statusOf(order.id)).toBe('paid');
    expect(c.mails('Payment received')).toHaveLength(1);
    expect(adminMails(order.number)).toHaveLength(1);
  });

  it('pays on capture with fraud accept, keeps capture with challenge pending, and ignores a later settlement', async () => {
    const c = await customer();
    const { body: challenged } = await c.checkout().expect(201);
    await notify(challenged, { transaction_status: 'capture', fraud_status: 'challenge', payment_type: 'credit_card' }).expect(200);
    await notify(challenged, { transaction_status: 'deny', status_code: '202' }).expect(200);
    expect(await statusOf(challenged.id)).toBe('pending_payment');

    await c.a.post('/api/cart/items').send({ variantId: c.variant.id, quantity: 1 }).expect(200);
    const { body: card } = await c.checkout().expect(201);
    await notify(card, { transaction_status: 'capture', fraud_status: 'accept', payment_type: 'credit_card' }).expect(200);
    expect(await statusOf(card.id)).toBe('paid');
    await vi.waitFor(() => expect(c.mails('Payment received')).toHaveLength(1), { timeout: 15_000 });

    // Cards settle a day later: already paid, so nothing changes and no email is re-queued.
    await notify(card).expect(200);
    await settle();
    expect(await statusOf(card.id)).toBe('paid');
    expect(c.mails('Payment received')).toHaveLength(1);
  });

  it.each(['expire', 'cancel'])('expires a pending Order on a %s notification, returning its Stock once', async (transaction_status) => {
    const c = await customer();
    const { body: order } = await c.checkout().expect(201);
    const stock = async () => (await prisma.variant.findUniqueOrThrow({ where: { id: c.variant.id } })).stock;
    expect(await stock()).toBe(8);

    await notify(order, { transaction_status, status_code: '202' }).expect(200);
    await notify(order, { transaction_status, status_code: '202' }).expect(200);
    expect(await statusOf(order.id)).toBe('expired');
    expect(await stock()).toBe(10);
    await vi.waitFor(() => expect(c.mails(`Order ${order.number} expired`)).toHaveLength(1), { timeout: 15_000 });
  });

  it('ignores deny, since the Customer may still pay another way', async () => {
    const c = await customer();
    const { body: order } = await c.checkout().expect(201);
    await notify(order, { transaction_status: 'deny', status_code: '202' }).expect(200);
    expect(await statusOf(order.id)).toBe('pending_payment');
  });

  it('rejects a bad signature or a tampered amount, changing nothing', async () => {
    const c = await customer();
    const { body: order } = await c.checkout().expect(201);
    await notify(order, {}, { signature_key: 'f'.repeat(128) }).expect(401);
    await notify(order, {}, { signature_key: 'short' }).expect(401);
    await notify(order, {}, { gross_amount: '1.00' }).expect(401);
    await notify(order, {}, { transaction_status: 'settlement', order_id: 'ORD-OTHER' }).expect(401);
    // A signed notification whose amount isn't the Order total doesn't pay it either.
    await notify(order, { gross_amount: '1.00' }).expect(200);
    await request(t.app.getHttpServer()).post('/api/payments/notification').send({ order_id: order.number }).expect(400);
    await settle();
    expect(await statusOf(order.id)).toBe('pending_payment');
    expect(c.mails('Payment received')).toHaveLength(0);
  });
});
