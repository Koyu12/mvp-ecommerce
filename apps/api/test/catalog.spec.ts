import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { seedAdmin } from '../src/auth/seed';
import { PrismaService } from '../src/infra/prisma.service';
import { FakeGoogle } from './fakes';
import { createTestApp, TestApp } from './test-app';

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct-horse-battery';

describe('Admin catalog', () => {
  let t: TestApp;
  let prisma: PrismaService;
  let admin: request.Agent;
  const google = new FakeGoogle();

  const agent = () => {
    const ip = `10.3.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
    const a = request.agent(t.app.getHttpServer());
    const auth = (path: string, body: object) =>
      a.post(`/api/auth${path}`).set('Origin', ORIGIN).set('X-Forwarded-For', ip).send(body);
    return { a, auth };
  };

  const signInAdmin = async () => {
    const email = `${randomUUID()}@example.com`;
    await seedAdmin(prisma, email);
    const { a, auth } = agent();
    const start = await auth('/sign-in/social', { provider: 'google', callbackURL: '/' }).expect(200);
    const state = new URL(start.body.url).searchParams.get('state')!;
    await a.get(`/api/auth/callback/google?code=${google.codeFor({ sub: randomUUID(), email })}&state=${state}`).expect(302);
    return a;
  };

  const signInCustomer = async () => {
    const email = `${randomUUID()}@example.com`;
    const { a, auth } = agent();
    const { body } = await auth('/sign-up/email', { name: 'Ann Customer', email, password: PASSWORD }).expect(200);
    await prisma.user.update({ where: { id: body.user.id }, data: { emailVerified: true } });
    await auth('/sign-in/email', { email, password: PASSWORD }).expect(200);
    return a;
  };

  beforeAll(async () => {
    vi.stubGlobal('fetch', google.wrap(globalThis.fetch));
    t = await createTestApp();
    prisma = t.app.get(PrismaService);
    admin = await signInAdmin();
  });
  afterAll(async () => {
    await t.close();
    vi.unstubAllGlobals();
  });

  const unique = (name: string) => `${name} ${randomUUID().slice(0, 8)}`;

  it('refuses every Admin catalog route to Guests with 401 and to Customers with 403', async () => {
    const customer = await signInCustomer();
    const guest = request(t.app.getHttpServer());
    const routes = [
      ['get', '/api/admin/categories'],
      ['post', '/api/admin/categories'],
      ['patch', '/api/admin/categories/x'],
      ['delete', '/api/admin/categories/x'],
      ['get', '/api/admin/option-types'],
      ['post', '/api/admin/option-types'],
      ['post', '/api/admin/option-types/x/values'],
      ['patch', '/api/admin/option-values/x'],
      ['get', '/api/admin/products'],
      ['post', '/api/admin/products'],
      ['get', '/api/admin/products/x'],
      ['patch', '/api/admin/products/x'],
      ['post', '/api/admin/products/x/variants'],
      ['patch', '/api/admin/variants/x'],
      ['get', '/api/admin/variants/low-stock'],
    ] as const;
    for (const [method, path] of routes) {
      expect((await guest[method](path).send({ name: 'X' })).status, `${method} ${path}`).toBe(401);
      expect((await customer[method](path).send({ name: 'X' })).status, `${method} ${path}`).toBe(403);
    }
    expect(await prisma.category.count({ where: { name: 'X' } })).toBe(0);
  });

  describe('Categories', () => {
    it('creates, lists, renames and deletes a Category', async () => {
      const name = unique('T-shirts');
      const { body: created } = await admin.post('/api/admin/categories').send({ name }).expect(201);
      expect(created).toEqual({ id: expect.any(String), name });

      const list = await admin.get('/api/admin/categories').expect(200);
      expect(list.body).toContainEqual(created);

      const renamed = await admin.patch(`/api/admin/categories/${created.id}`).send({ name: `${name} 2` }).expect(200);
      expect(renamed.body).toEqual({ id: created.id, name: `${name} 2` });

      await admin.delete(`/api/admin/categories/${created.id}`).expect(204);
      const after = await admin.get('/api/admin/categories').expect(200);
      expect(after.body).not.toContainEqual(expect.objectContaining({ id: created.id }));
      await admin.patch(`/api/admin/categories/${created.id}`).send({ name: 'x' }).expect(404);
    });

    it('refuses a blank or duplicate name', async () => {
      const name = unique('Shoes');
      await admin.post('/api/admin/categories').send({ name: '  ' }).expect(400);
      await admin.post('/api/admin/categories').send({ name }).expect(201);
      await admin.post('/api/admin/categories').send({ name }).expect(409);
    });
  });

  describe('Option types and Option values', () => {
    it('creates, lists, renames and deletes Option types and their values', async () => {
      const name = unique('Size');
      const { body: size } = await admin.post('/api/admin/option-types').send({ name }).expect(201);
      expect(size).toEqual({ id: expect.any(String), name, values: [] });

      const { body: s } = await admin.post(`/api/admin/option-types/${size.id}/values`).send({ value: 'S' }).expect(201);
      const { body: m } = await admin.post(`/api/admin/option-types/${size.id}/values`).send({ value: 'M' }).expect(201);
      expect(s).toEqual({ id: expect.any(String), value: 'S' });
      await admin.patch(`/api/admin/option-values/${m.id}`).send({ value: 'L' }).expect(200, { id: m.id, value: 'L' });
      await admin.patch(`/api/admin/option-types/${size.id}`).send({ name: `${name}!` }).expect(200);

      const list = await admin.get('/api/admin/option-types').expect(200);
      expect(list.body).toContainEqual({ id: size.id, name: `${name}!`, values: [s, { id: m.id, value: 'L' }] });

      await admin.delete(`/api/admin/option-values/${s.id}`).expect(204);
      await admin.delete(`/api/admin/option-types/${size.id}`).expect(204);
      const after = await admin.get('/api/admin/option-types').expect(200);
      expect(after.body).not.toContainEqual(expect.objectContaining({ id: size.id }));
    });

    it('refuses a duplicate value within one Option type, and a value for a missing type', async () => {
      const { body: colour } = await admin.post('/api/admin/option-types').send({ name: unique('Colour') }).expect(201);
      await admin.post(`/api/admin/option-types/${colour.id}/values`).send({ value: 'Red' }).expect(201);
      await admin.post(`/api/admin/option-types/${colour.id}/values`).send({ value: 'Red' }).expect(409);
      await admin.post(`/api/admin/option-types/${colour.id}/values`).send({ value: '' }).expect(400);
      await admin.post('/api/admin/option-types/missing/values').send({ value: 'Red' }).expect(404);
    });

    it('refuses to delete an Option value a Variant uses, or an Option type a Product uses', async () => {
      const { product, size, colour } = await catalog();
      const { body: v } = await admin
        .post(`/api/admin/products/${product.id}/variants`)
        .send({ sku: unique('SKU'), stock: 3, optionValueIds: [size.m, colour.red] })
        .expect(201);

      await admin.delete(`/api/admin/option-values/${size.m}`).expect(409);
      await admin.delete(`/api/admin/option-types/${size.id}`).expect(409);
      await admin.delete(`/api/admin/categories/${product.categoryId}`).expect(409);
      const after = await admin.get(`/api/admin/products/${product.id}`).expect(200);
      expect(after.body.variants[0]).toMatchObject({ id: v.id, optionValueIds: [size.m, colour.red].sort() });
    });
  });

  // A Category, a Size (S, M) and a Colour (Red) type, and a Product priced 150 000 IDR that uses both types.
  const catalog = async () => {
    const { body: category } = await admin.post('/api/admin/categories').send({ name: unique('Shirts') }).expect(201);
    const type = async (name: string, values: string[]) => {
      const { body } = await admin.post('/api/admin/option-types').send({ name: unique(name) }).expect(201);
      const ids = [];
      for (const value of values) {
        ids.push((await admin.post(`/api/admin/option-types/${body.id}/values`).send({ value }).expect(201)).body.id);
      }
      return { id: body.id as string, ids: ids as string[] };
    };
    const s = await type('Size', ['S', 'M']);
    const c = await type('Colour', ['Red']);
    const { body: product } = await admin
      .post('/api/admin/products')
      .send({ name: 'Basic tee', description: 'Cotton', categoryId: category.id, price: 150_000, optionTypeIds: [s.id, c.id] })
      .expect(201);
    return {
      product,
      size: { id: s.id, s: s.ids[0], m: s.ids[1] },
      colour: { id: c.id, red: c.ids[0] },
    };
  };

  describe('Products and Variants', () => {
    it('creates and edits a Product', async () => {
      const { product, size, colour } = await catalog();
      expect(product).toEqual({
        id: expect.any(String),
        name: 'Basic tee',
        description: 'Cotton',
        categoryId: expect.any(String),
        price: 150_000,
        archived: false,
        optionTypeIds: [size.id, colour.id].sort(),
        variants: [],
      });

      const { body: other } = await admin.post('/api/admin/categories').send({ name: unique('Tops') }).expect(201);
      const edited = await admin
        .patch(`/api/admin/products/${product.id}`)
        .send({ name: 'Premium tee', price: 175_000, categoryId: other.id })
        .expect(200);
      expect(edited.body).toMatchObject({ name: 'Premium tee', description: 'Cotton', price: 175_000, categoryId: other.id });
      await admin.get(`/api/admin/products/${product.id}`).expect(200).expect((r) => expect(r.body.name).toBe('Premium tee'));
      const list = await admin.get('/api/admin/products').expect(200);
      expect(list.body).toContainEqual(expect.objectContaining({ id: product.id, name: 'Premium tee' }));
    });

    it('refuses an invalid Product', async () => {
      const { product } = await catalog();
      const valid = { name: 'Tee', description: '', categoryId: product.categoryId, price: 1000, optionTypeIds: [] };
      for (const bad of [
        { ...valid, name: ' ' },
        { ...valid, price: -1 },
        { ...valid, price: 1000.5 },
        { ...valid, price: '1000' },
        { ...valid, categoryId: 'missing' },
        { ...valid, optionTypeIds: ['missing'] },
      ]) {
        const res = await admin.post('/api/admin/products').send(bad);
        expect(res.status, JSON.stringify(bad)).toBe(400);
      }
      await admin.patch(`/api/admin/products/${product.id}`).send({ price: -5 }).expect(400);
      await admin.patch('/api/admin/products/missing').send({ price: 5 }).expect(404);
    });

    it("gives a Variant its own price when set, otherwise the Product's", async () => {
      const { product, size, colour } = await catalog();
      const add = (body: object) => admin.post(`/api/admin/products/${product.id}/variants`).send(body).expect(201);

      const { body: plain } = await add({ sku: unique('TEE-S-RED'), stock: 10, optionValueIds: [size.s, colour.red] });
      const { body: dear } = await add({ sku: unique('TEE-M-RED'), stock: 4, price: 180_000, optionValueIds: [colour.red, size.m] });
      expect(plain).toMatchObject({ stock: 10, price: null, effectivePrice: 150_000, archived: false });
      expect(dear).toMatchObject({ stock: 4, price: 180_000, effectivePrice: 180_000 });

      // A Product price change reaches only the Variant without its own price.
      await admin.patch(`/api/admin/products/${product.id}`).send({ price: 160_000 }).expect(200);
      const { body: after } = await admin.get(`/api/admin/products/${product.id}`).expect(200);
      expect(after.variants.map((v: { effectivePrice: number }) => v.effectivePrice)).toEqual([160_000, 180_000]);

      // Clearing the override falls back to the Product price; Stock is edited the same way.
      const cleared = await admin.patch(`/api/admin/variants/${dear.id}`).send({ price: null, stock: 7 }).expect(200);
      expect(cleared.body).toMatchObject({ price: null, effectivePrice: 160_000, stock: 7 });
    });

    it('rejects a duplicate SKU on create and on edit', async () => {
      const { product, size, colour } = await catalog();
      const sku = unique('DUP');
      const url = `/api/admin/products/${product.id}/variants`;
      await admin.post(url).send({ sku, stock: 1, optionValueIds: [size.s, colour.red] }).expect(201);
      const { body: other } = await admin.post(url).send({ sku: unique('OK'), stock: 1, optionValueIds: [size.m, colour.red] });

      await admin.post(url).send({ sku, stock: 1, optionValueIds: [size.m, colour.red] }).expect(409);
      await admin.patch(`/api/admin/variants/${other.id}`).send({ sku }).expect(409);
    });

    it('requires exactly one Option value per Option type of the Product', async () => {
      const { product, size, colour } = await catalog();
      const { colour: foreign } = await catalog();
      const url = `/api/admin/products/${product.id}/variants`;
      const send = (optionValueIds: string[]) => admin.post(url).send({ sku: unique('SKU'), stock: 1, optionValueIds });

      for (const ids of [
        [size.s], // no Colour
        [size.s, size.m, colour.red], // two Sizes
        [size.s, size.s, colour.red], // the same value twice
        [size.s, foreign.red], // a Colour type this Product doesn't use
        [size.s, colour.red, foreign.red], // an extra type
        [size.s, 'missing'],
      ]) {
        expect((await send(ids)).status, JSON.stringify(ids)).toBe(400);
      }
      await send([size.s, colour.red]).expect(201);
      // The same combination twice would be two Variants a Customer can't tell apart.
      await send([colour.red, size.s]).expect(409);

      const { body } = await send([size.m, colour.red]).expect(201);
      await admin.patch(`/api/admin/variants/${body.id}`).send({ optionValueIds: [size.m] }).expect(400);
      await admin.patch(`/api/admin/variants/${body.id}`).send({ optionValueIds: [size.s, colour.red] }).expect(409);
      await admin.post(url).send({ sku: unique('SKU'), stock: -1, optionValueIds: [size.m, colour.red] }).expect(400);
      expect((await admin.get(`/api/admin/products/${product.id}`)).body.variants).toHaveLength(2);
    });

    it("refuses changing a Product's Option types once it has Variants", async () => {
      const { product, size, colour } = await catalog();
      await admin.patch(`/api/admin/products/${product.id}`).send({ optionTypeIds: [size.id] }).expect(200);
      await admin.patch(`/api/admin/products/${product.id}`).send({ optionTypeIds: [size.id, colour.id] }).expect(200);
      await admin
        .post(`/api/admin/products/${product.id}/variants`)
        .send({ sku: unique('SKU'), stock: 1, optionValueIds: [size.s, colour.red] })
        .expect(201);

      await admin.patch(`/api/admin/products/${product.id}`).send({ optionTypeIds: [size.id] }).expect(409);
      // Sending the same set again is not a change.
      await admin.patch(`/api/admin/products/${product.id}`).send({ optionTypeIds: [colour.id, size.id] }).expect(200);
    });

    it('archives and unarchives Products and Variants, and never deletes them', async () => {
      const { product, size, colour } = await catalog();
      const { body: v } = await admin
        .post(`/api/admin/products/${product.id}/variants`)
        .send({ sku: unique('SKU'), stock: 1, optionValueIds: [size.s, colour.red] })
        .expect(201);

      await admin.patch(`/api/admin/products/${product.id}`).send({ archived: true }).expect(200);
      await admin.patch(`/api/admin/variants/${v.id}`).send({ archived: true }).expect(200);
      let { body } = await admin.get(`/api/admin/products/${product.id}`).expect(200);
      expect(body).toMatchObject({ archived: true, variants: [{ id: v.id, archived: true }] });

      await admin.patch(`/api/admin/products/${product.id}`).send({ archived: false }).expect(200);
      await admin.patch(`/api/admin/variants/${v.id}`).send({ archived: false }).expect(200);
      ({ body } = await admin.get(`/api/admin/products/${product.id}`).expect(200));
      expect(body).toMatchObject({ archived: false, variants: [{ id: v.id, archived: false }] });

      await admin.delete(`/api/admin/products/${product.id}`).expect(404);
      await admin.delete(`/api/admin/variants/${v.id}`).expect(404);
      await admin.get(`/api/admin/products/${product.id}`).expect(200);
    });
  });

  describe('low-Stock list', () => {
    it('lists Variants below the threshold that are on sale, lowest Stock first', async () => {
      const { product, size, colour } = await catalog();
      const { product: archivedProduct, size: s2, colour: c2 } = await catalog();
      const add = async (productId: string, stock: number, optionValueIds: string[]) =>
        (await admin.post(`/api/admin/products/${productId}/variants`).send({ sku: unique('LOW'), stock, optionValueIds }).expect(201))
          .body;
      const two = await add(product.id, 2, [size.s, colour.red]);
      const five = await add(product.id, 5, [size.m, colour.red]);
      const hidden = await add(archivedProduct.id, 0, [s2.s, c2.red]);
      await admin.patch(`/api/admin/products/${archivedProduct.id}`).send({ archived: true }).expect(200);
      const archivedVariant = await add(archivedProduct.id, 0, [s2.m, c2.red]);
      await admin.patch(`/api/admin/variants/${archivedVariant.id}`).send({ archived: true }).expect(200);

      const ours = (body: { id: string }[]) => body.filter((v) => [two.id, five.id, hidden.id, archivedVariant.id].includes(v.id));

      // Default threshold is 5: Stock 5 is not low.
      const { body: low } = await admin.get('/api/admin/variants/low-stock').expect(200);
      expect(ours(low)).toEqual([expect.objectContaining({ id: two.id, stock: 2, productName: 'Basic tee', effectivePrice: 150_000 })]);
      const { body: wider } = await admin.get('/api/admin/variants/low-stock?below=6').expect(200);
      expect(ours(wider).map((v) => v.id)).toEqual([two.id, five.id]);
      await admin.get('/api/admin/variants/low-stock?below=-1').expect(400);
    });
  });
});
