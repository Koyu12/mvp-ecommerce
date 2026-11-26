import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/infra/prisma.service';
import { createTestApp, TestApp } from './test-app';

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct-horse-battery';

describe('Cart', () => {
  let t: TestApp;
  let prisma: PrismaService;

  beforeAll(async () => {
    t = await createTestApp();
    prisma = t.app.get(PrismaService);
  });
  afterAll(() => t.close());

  const signInCustomer = async () => {
    const email = `${randomUUID()}@example.com`;
    const ip = `10.4.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
    const a = request.agent(t.app.getHttpServer());
    const auth = (path: string, body: object) => a.post(`/api/auth${path}`).set('Origin', ORIGIN).set('X-Forwarded-For', ip).send(body);
    const { body } = await auth('/sign-up/email', { name: 'Ann Customer', email, password: PASSWORD }).expect(200);
    await prisma.user.update({ where: { id: body.user.id }, data: { emailVerified: true } });
    await auth('/sign-in/email', { email, password: PASSWORD }).expect(200);
    return { a, auth, email };
  };

  // Fixtures go straight to the database; the Admin API that writes them is covered in catalog.spec.ts.
  const variant = async (opts: { productPrice?: number; price?: number | null; stock?: number; archived?: boolean; productArchived?: boolean } = {}) => {
    const category = await prisma.category.create({ data: { name: `Cat ${randomUUID()}` } });
    const size = await prisma.optionType.create({ data: { name: `Size ${randomUUID()}`, values: { create: { value: 'M' } } }, include: { values: true } });
    const product = await prisma.product.create({
      data: {
        name: 'Tee',
        description: 'A tee',
        categoryId: category.id,
        price: opts.productPrice ?? 100_000,
        archived: opts.productArchived ?? false,
        optionTypes: { connect: { id: size.id } },
        variants: {
          create: {
            sku: `SKU-${randomUUID()}`,
            stock: opts.stock ?? 10,
            price: opts.price ?? null,
            archived: opts.archived ?? false,
            optionValues: { connect: { id: size.values[0]!.id } },
          },
        },
      },
      include: { variants: true },
    });
    return product.variants[0]!;
  };

  it('refuses every Cart route to Guests', async () => {
    const guest = request(t.app.getHttpServer());
    await guest.get('/api/cart').expect(401);
    await guest.post('/api/cart/items').send({ variantId: 'x', quantity: 1 }).expect(401);
    await guest.put('/api/cart/items/x').send({ quantity: 1 }).expect(401);
    await guest.delete('/api/cart/items/x').expect(401);
  });

  it('adds, sets and removes items, with live effective prices and a subtotal', async () => {
    const { a } = await signInCustomer();
    const tee = await variant({ productPrice: 100_000 });
    const xl = await variant({ productPrice: 100_000, price: 120_000 });

    await a.get('/api/cart').expect(200, { items: [], subtotal: 0, shippingFee: 0, total: 0 });
    await a.post('/api/cart/items').send({ variantId: tee.id, quantity: 1 }).expect(200);
    await a.post('/api/cart/items').send({ variantId: tee.id, quantity: 2 }).expect(200);
    const { body } = await a.post('/api/cart/items').send({ variantId: xl.id, quantity: 1 }).expect(200);
    expect(body.items).toEqual([
      expect.objectContaining({ variantId: tee.id, sku: tee.sku, productName: 'Tee', options: ['M'], quantity: 3, unitPrice: 100_000, lineTotal: 300_000 }),
      expect.objectContaining({ variantId: xl.id, quantity: 1, unitPrice: 120_000, lineTotal: 120_000 }),
    ]);
    expect(body.subtotal).toBe(420_000);
    // The Shipping fee comes from Store settings. Another test file may change it, so read it now.
    const { shippingFee } = await prisma.storeSettings.findUniqueOrThrow({ where: { id: 1 } });
    expect(shippingFee).toBeGreaterThan(0);
    const { body: priced } = await a.get('/api/cart').expect(200);
    expect(priced).toMatchObject({ subtotal: 420_000, shippingFee, total: 420_000 + shippingFee });

    // Setting a quantity twice lands in the same state.
    await a.put(`/api/cart/items/${tee.id}`).send({ quantity: 5 }).expect(200);
    const again = await a.put(`/api/cart/items/${tee.id}`).send({ quantity: 5 }).expect(200);
    expect(again.body.items[0]).toMatchObject({ variantId: tee.id, quantity: 5 });

    await a.delete(`/api/cart/items/${xl.id}`).expect(200);
    const after = await a.get('/api/cart').expect(200);
    expect(after.body.items.map((i: { variantId: string }) => i.variantId)).toEqual([tee.id]);
    expect(after.body.subtotal).toBe(500_000);
  });

  it('refuses a bad quantity, a missing or Archived Variant, and setting an item not in the Cart', async () => {
    const { a } = await signInCustomer();
    const tee = await variant();
    const gone = await variant({ archived: true });
    const goneProduct = await variant({ productArchived: true });
    for (const quantity of [0, -1, 1.5, 1000, '2']) await a.post('/api/cart/items').send({ variantId: tee.id, quantity }).expect(400);
    await a.post('/api/cart/items').send({ variantId: 'missing', quantity: 1 }).expect(404);
    await a.post('/api/cart/items').send({ variantId: gone.id, quantity: 1 }).expect(404);
    await a.post('/api/cart/items').send({ variantId: goneProduct.id, quantity: 1 }).expect(404);
    await a.put(`/api/cart/items/${tee.id}`).send({ quantity: 1 }).expect(404);
    await a.delete(`/api/cart/items/${tee.id}`).expect(404);
  });

  it('never changes Stock', async () => {
    const { a } = await signInCustomer();
    const tee = await variant({ stock: 4 });
    await a.post('/api/cart/items').send({ variantId: tee.id, quantity: 3 }).expect(200);
    await a.put(`/api/cart/items/${tee.id}`).send({ quantity: 4 }).expect(200);
    await a.delete(`/api/cart/items/${tee.id}`).expect(200);
    await request(t.app.getHttpServer()).get(`/api/products/${tee.productId}`).expect(200)
      .expect((r) => expect(r.body.variants[0].stock).toBe(4));
  });

  it('flags price changes, low Stock, out of Stock and Archived items', async () => {
    const { a } = await signInCustomer();
    const repriced = await variant({ productPrice: 100_000 });
    const overridden = await variant({ productPrice: 100_000 });
    const low = await variant({ stock: 3 });
    const short = await variant({ stock: 20 });
    const out = await variant({ stock: 1 });
    const archived = await variant();
    const archivedProduct = await variant();
    const fine = await variant({ stock: 50 });
    for (const v of [repriced, overridden, low, out, archived, archivedProduct, fine]) {
      await a.post('/api/cart/items').send({ variantId: v.id, quantity: 1 }).expect(200);
    }
    await a.post('/api/cart/items').send({ variantId: short.id, quantity: 8 }).expect(200);

    await prisma.product.update({ where: { id: repriced.productId }, data: { price: 90_000 } });
    await prisma.variant.update({ where: { id: overridden.id }, data: { price: 110_000 } });
    await prisma.variant.update({ where: { id: short.id }, data: { stock: 6 } });
    await prisma.variant.update({ where: { id: out.id }, data: { stock: 0 } });
    await prisma.variant.update({ where: { id: archived.id }, data: { archived: true } });
    await prisma.product.update({ where: { id: archivedProduct.productId }, data: { archived: true } });

    const { body } = await a.get('/api/cart').expect(200);
    const line = (id: string) => body.items.find((i: { variantId: string }) => i.variantId === id);
    expect(line(repriced.id)).toMatchObject({ unitPrice: 90_000, priceChanged: true, addedPrice: 100_000, availability: 'in_stock' });
    expect(line(overridden.id)).toMatchObject({ unitPrice: 110_000, priceChanged: true, addedPrice: 100_000 });
    expect(line(low.id)).toMatchObject({ availability: 'low_stock', stock: 3, priceChanged: false });
    expect(line(short.id)).toMatchObject({ availability: 'low_stock', stock: 6, quantity: 8 });
    expect(line(out.id)).toMatchObject({ availability: 'out_of_stock', stock: 0 });
    expect(line(archived.id)).toMatchObject({ availability: 'archived' });
    expect(line(archivedProduct.id)).toMatchObject({ availability: 'archived' });
    expect(line(fine.id)).toMatchObject({ availability: 'in_stock', priceChanged: false, unitPrice: 100_000 });
    // Only lines that can be bought count: 90k + 110k + 100k (low) + 8 x 100k (short) + 100k (fine).
    expect(body.subtotal).toBe(1_200_000);

    // Adding again keeps the price first added, so the notice stays.
    await a.post('/api/cart/items').send({ variantId: repriced.id, quantity: 1 }).expect(200);
    const { body: after } = await a.get('/api/cart').expect(200);
    expect(after.items.find((i: { variantId: string }) => i.variantId === repriced.id)).toMatchObject({
      quantity: 2,
      unitPrice: 90_000,
      addedPrice: 100_000,
      priceChanged: true,
    });
  });

  it('charges no Shipping fee when nothing in the Cart can be bought', async () => {
    const { a } = await signInCustomer();
    const out = await variant({ stock: 1 });
    await a.post('/api/cart/items').send({ variantId: out.id, quantity: 1 }).expect(200);
    await prisma.variant.update({ where: { id: out.id }, data: { stock: 0 } });
    const { body } = await a.get('/api/cart').expect(200);
    expect(body).toMatchObject({ subtotal: 0, shippingFee: 0, total: 0 });
  });

  it('keeps the Cart across sessions and devices, and shows each Customer only their own', async () => {
    const ann = await signInCustomer();
    const bob = await signInCustomer();
    const tee = await variant();
    await ann.a.post('/api/cart/items').send({ variantId: tee.id, quantity: 2 }).expect(200);

    // A second device signs in to the same account.
    const ip = `10.5.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
    const phone = request.agent(t.app.getHttpServer());
    await phone.post('/api/auth/sign-in/email').set('Origin', ORIGIN).set('X-Forwarded-For', ip).send({ email: ann.email, password: PASSWORD }).expect(200);
    const { body } = await phone.get('/api/cart').expect(200);
    expect(body.items).toEqual([expect.objectContaining({ variantId: tee.id, quantity: 2 })]);

    // Bob sees an empty Cart and can't change or remove Ann's item.
    await bob.a.get('/api/cart').expect(200, { items: [], subtotal: 0, shippingFee: 0, total: 0 });
    await bob.a.put(`/api/cart/items/${tee.id}`).send({ quantity: 9 }).expect(404);
    await bob.a.delete(`/api/cart/items/${tee.id}`).expect(404);
    await bob.a.post('/api/cart/items').send({ variantId: tee.id, quantity: 1 }).expect(200);
    await bob.a.delete(`/api/cart/items/${tee.id}`).expect(200);

    // Signing out and back in keeps it.
    await ann.auth('/sign-out', {}).expect(200);
    await ann.a.get('/api/cart').expect(401);
    await ann.auth('/sign-in/email', { email: ann.email, password: PASSWORD }).expect(200);
    const { body: back } = await ann.a.get('/api/cart').expect(200);
    expect(back.items).toEqual([expect.objectContaining({ variantId: tee.id, quantity: 2 })]);
  });
});
