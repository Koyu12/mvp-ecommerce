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
        images: [],
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

describe('Storefront', () => {
  let t: TestApp;
  let prisma: PrismaService;
  const tag = () => randomUUID().slice(0, 8);

  beforeAll(async () => {
    t = await createTestApp();
    prisma = t.app.get(PrismaService);
  });
  afterAll(() => t.close());

  type VariantSeed = { stock?: number; price?: number | null; archived?: boolean; values?: string[] };
  // Fixtures go straight to the database; the Admin API that writes them is covered above.
  const product = async (categoryId: string, name: string, opts: { price?: number; archived?: boolean; types?: string[]; variants?: VariantSeed[] } = {}) =>
    prisma.product.create({
      data: {
        name,
        description: `About ${name}`,
        categoryId,
        price: opts.price ?? 100_000,
        archived: opts.archived ?? false,
        optionTypes: { connect: (opts.types ?? []).map((id) => ({ id })) },
        variants: {
          create: (opts.variants ?? [{}]).map((v) => ({
            sku: `SKU-${randomUUID()}`,
            stock: v.stock ?? 3,
            price: v.price ?? null,
            archived: v.archived ?? false,
            optionValues: { connect: (v.values ?? []).map((id) => ({ id })) },
          })),
        },
      },
    });
  const category = () => prisma.category.create({ data: { name: `Cat ${tag()}` } });

  it('lists a Category\'s Products on sale, newest first, a page at a time', async () => {
    const cat = await category();
    const other = await category();
    const a = await product(cat.id, 'Tee A');
    const b = await product(cat.id, 'Tee B', { price: 90_000, variants: [{ price: 120_000 }, { price: null }] });
    const c = await product(cat.id, 'Tee C');
    await product(cat.id, 'Archived tee', { archived: true });
    await product(cat.id, 'Only archived Variants', { variants: [{ archived: true }] });
    await product(other.id, 'Elsewhere');

    const { body: first } = await t.http().get(`/api/products?categoryId=${cat.id}&pageSize=2`).expect(200);
    expect(first).toEqual({
      items: [
        { id: c.id, name: 'Tee C', categoryId: cat.id, fromPrice: 100_000, inStock: true },
        { id: b.id, name: 'Tee B', categoryId: cat.id, fromPrice: 90_000, inStock: true },
      ],
      total: 3,
      page: 1,
      pageSize: 2,
    });
    const { body: second } = await t.http().get(`/api/products?categoryId=${cat.id}&pageSize=2&page=2`).expect(200);
    expect(second.items.map((p: { id: string }) => p.id)).toEqual([a.id]);
    await t.http().get('/api/products?pageSize=0').expect(400);
  });

  it('searches Product names case-insensitively, never showing Archived ones', async () => {
    const cat = await category();
    const word = `zq${tag()}`;
    const hit = await product(cat.id, `Linen ${word.toUpperCase()} shirt`);
    await product(cat.id, `${word} archived`, { archived: true });
    await product(cat.id, 'Unrelated shirt');

    const { body } = await t.http().get(`/api/products?q=${word}`).expect(200);
    expect(body.items.map((p: { id: string }) => p.id)).toEqual([hit.id]);
    expect(body.total).toBe(1);
  });

  it('filters by effective price range and by size and colour, all on one Variant on sale', async () => {
    const cat = await category();
    const size = await prisma.optionType.create({ data: { name: `Size ${tag()}`, values: { create: [{ value: 'S' }, { value: 'M' }, { value: 'L' }] } }, include: { values: true } });
    const colour = await prisma.optionType.create({ data: { name: `Colour ${tag()}`, values: { create: [{ value: 'Red' }, { value: 'Blue' }] } }, include: { values: true } });
    const [s, m, l] = size.values.map((v) => v.id);
    const [red, blue] = colour.values.map((v) => v.id);
    const types = [size.id, colour.id];
    // S/Red at 100k, M/Blue at its own 250k.
    await product(cat.id, 'Small red', { types, variants: [{ values: [s, red] }, { values: [m, blue], price: 250_000 }] });
    // M/Red exists only as an Archived Variant.
    await product(cat.id, 'Archived M red', { types, variants: [{ values: [l, blue] }, { values: [m, red], archived: true }] });
    await product(cat.id, 'Medium red', { types, price: 300_000, variants: [{ values: [m, red] }] });

    const ids = async (query: string) =>
      (await t.http().get(`/api/products?categoryId=${cat.id}&${query}`).expect(200)).body.items.map((p: { name: string }) => p.name).sort();

    expect(await ids(`optionValueIds=${m},${red}`)).toEqual(['Medium red']);
    // Values of one Option type are alternatives.
    expect(await ids(`optionValueIds=${s},${m},${red}`)).toEqual(['Medium red', 'Small red']);
    // Price range uses the Variant's own price when set.
    expect(await ids('minPrice=200000&maxPrice=260000')).toEqual(['Small red']);
    // Price and options must hold for the same Variant: Small red's M/Blue is 250k but not Red.
    expect(await ids(`minPrice=200000&maxPrice=260000&optionValueIds=${red}`)).toEqual([]);
    expect(await ids('maxPrice=99999')).toEqual([]);
    expect(await ids(`optionValueIds=nope`)).toEqual([]);
    await t.http().get('/api/products?minPrice=abc').expect(400);
  });

  it('shows a Product page with its Variants on sale, effective prices, Stock and only usable Option values', async () => {
    const cat = await category();
    const size = await prisma.optionType.create({ data: { name: `Size ${tag()}`, values: { create: [{ value: 'S' }, { value: 'M' }, { value: 'L' }] } }, include: { values: true } });
    const [s, m, l] = size.values.map((v) => v.id);
    const p = await product(cat.id, 'Hoodie', {
      price: 200_000,
      types: [size.id],
      variants: [{ values: [s], stock: 0 }, { values: [m], price: 220_000, stock: 4 }, { values: [l], archived: true }],
    });
    const variants = await prisma.variant.findMany({ where: { productId: p.id }, orderBy: { createdAt: 'asc' } });

    const { body } = await t.http().get(`/api/products/${p.id}`).expect(200);
    expect(body).toEqual({
      id: p.id,
      name: 'Hoodie',
      description: 'About Hoodie',
      category: { id: cat.id, name: cat.name },
      optionTypes: [{ id: size.id, name: size.name, values: [{ id: s, value: 'S' }, { id: m, value: 'M' }] }],
      variants: expect.arrayContaining([
        { id: variants[0].id, optionValueIds: [s], effectivePrice: 200_000, stock: 0 },
        { id: variants[1].id, optionValueIds: [m], effectivePrice: 220_000, stock: 4 },
      ]),
    });
    expect(body.variants).toHaveLength(2);

    const archived = await product(cat.id, 'Gone', { archived: true });
    await t.http().get(`/api/products/${archived.id}`).expect(404);
    await t.http().get('/api/products/nope').expect(404);
  });

  it('lists Categories and Option types to Guests', async () => {
    const cat = await category();
    const { body: cats } = await t.http().get('/api/categories').expect(200);
    expect(cats).toContainEqual({ id: cat.id, name: cat.name });
    const type = await prisma.optionType.create({ data: { name: `Fit ${tag()}`, values: { create: [{ value: 'Slim' }] } }, include: { values: true } });
    const { body: types } = await t.http().get('/api/option-types').expect(200);
    expect(types).toContainEqual({ id: type.id, name: type.name, values: [{ id: type.values[0].id, value: 'Slim' }] });
  });
});
