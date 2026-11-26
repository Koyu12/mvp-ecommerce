import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { seedAdmin } from '../src/auth/seed';
import { PrismaService } from '../src/infra/prisma.service';
import { S3Presigner } from '../src/media/presigner';
import { FakeGoogle } from './fakes';
import { createTestApp, TestApp } from './test-app';

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct-horse-battery';
const PUBLIC_URL = 'https://images.test';

describe('Image uploads', () => {
  let t: TestApp;
  let prisma: PrismaService;
  let admin: request.Agent;
  const google = new FakeGoogle();

  const agent = () => {
    const ip = `10.4.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
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

  const upload = async (contentType = 'image/png') =>
    (await admin.post('/api/admin/uploads').send({ contentType, size: 1000 }).expect(201)).body.url as string;

  describe('upload URLs', () => {
    it('gives an Admin a presigned upload URL and the public URL the image will have', async () => {
      const { body } = await admin.post('/api/admin/uploads').send({ contentType: 'image/webp', size: 123_456 }).expect(201);

      const signed = t.presigner.signed.at(-1)!;
      expect(signed).toEqual({ key: expect.stringMatching(/^images\/[0-9a-f-]{36}\.webp$/), contentType: 'image/webp', size: 123_456 });
      expect(body).toEqual({ uploadUrl: `https://storage.test/upload/${signed.key}`, url: `${PUBLIC_URL}/${signed.key}` });
    });

    it('signs the Content-Type and Content-Length into the real S3 upload URL, so storage refuses any other', async () => {
      // Signing is local: dummy credentials, no network.
      const url = new URL(await new S3Presigner().presignPut({ key: 'images/x.png', contentType: 'image/png', size: 1000 }));
      expect(url.searchParams.get('X-Amz-SignedHeaders')?.split(';')).toEqual(expect.arrayContaining(['content-type', 'content-length']));
    });

    it('refuses upload URLs to Guests with 401 and to Customers with 403', async () => {
      const customer = await signInCustomer();
      const body = { contentType: 'image/png', size: 1000 };
      await request(t.app.getHttpServer()).post('/api/admin/uploads').send(body).expect(401);
      await customer.post('/api/admin/uploads').send(body).expect(403);
    });

    it.each([
      ['a non-image type', { contentType: 'text/html', size: 1000 }],
      ['an SVG, which can carry scripts', { contentType: 'image/svg+xml', size: 1000 }],
      ['an empty file', { contentType: 'image/png', size: 0 }],
      ['a file over 5 MB', { contentType: 'image/png', size: 5 * 1024 * 1024 + 1 }],
    ])('rejects %s', async (_, body) => {
      const before = t.presigner.signed.length;
      await admin.post('/api/admin/uploads').send(body).expect(400);
      expect(t.presigner.signed.length).toBe(before);
    });
  });

  describe('images on Products and Variants', () => {
    const product = async (images?: string[], status = 201) => {
      const { body: category } = await admin.post('/api/admin/categories').send({ name: `Tops ${randomUUID().slice(0, 8)}` }).expect(201);
      const { body } = await admin
        .post('/api/admin/products')
        .send({ name: 'Basic tee', description: 'Cotton', categoryId: category.id, price: 150_000, optionTypeIds: [], images })
        .expect(status);
      return body;
    };

    it('saves uploaded image URLs on a Product in order, and reorders or removes them', async () => {
      const [a, b, c] = [await upload(), await upload('image/jpeg'), await upload()];
      const created = await product([a, b, c]);
      expect(created.images).toEqual([a, b, c]);

      const reordered = await admin.patch(`/api/admin/products/${created.id}`).send({ images: [c, a] }).expect(200);
      expect(reordered.body.images).toEqual([c, a]);
      // Leaving images out of an edit keeps them.
      await admin.patch(`/api/admin/products/${created.id}`).send({ name: 'Premium tee' }).expect(200);
      const { body: got } = await admin.get(`/api/admin/products/${created.id}`).expect(200);
      expect(got.images).toEqual([c, a]);
    });

    it('starts a Product with no images', async () => {
      expect((await product()).images).toEqual([]);
    });

    it('rejects image URLs that are not from our storage', async () => {
      await product(['https://evil.example/x.png'], 400);
      await product([`${PUBLIC_URL}.evil.example/x.png`], 400);
      // Resolves outside the storage path once a browser normalises it.
      await product([`${PUBLIC_URL}/images/../../x.png`], 400);
      // Only the exact shape an upload URL is issued with: images/<uuid>.<jpg|png|webp>, nothing after it.
      const issued = await upload();
      await product([`${issued}?v=1`], 400);
      await product([`${issued}#x`], 400);
      await product([issued.replace('.png', '.gif')], 400);
      await product([issued.replace('.png', 'xpng')], 400);
      await product([issued.replace('/images/', '/other/')], 400);
      await product([`${PUBLIC_URL}/images/not-a-uuid.png`], 400);
      await product([`${PUBLIC_URL}/images/sub/${randomUUID()}.png`], 400);
      await product([issued], 201);
      const created = await product();
      await admin.patch(`/api/admin/products/${created.id}`).send({ images: ['javascript:alert(1)'] }).expect(400);
    });

    it('sets, replaces and clears a Variant image', async () => {
      const p = await product();
      const red = await upload();
      const { body: variant } = await admin
        .post(`/api/admin/products/${p.id}/variants`)
        .send({ sku: `SKU-${randomUUID()}`, stock: 1, optionValueIds: [], image: red })
        .expect(201);
      expect(variant.image).toBe(red);

      const blue = await upload();
      const replaced = await admin.patch(`/api/admin/variants/${variant.id}`).send({ image: blue }).expect(200);
      expect(replaced.body.image).toBe(blue);
      await admin.patch(`/api/admin/variants/${variant.id}`).send({ image: 'https://evil.example/x.png' }).expect(400);
      const cleared = await admin.patch(`/api/admin/variants/${variant.id}`).send({ image: null }).expect(200);
      expect(cleared.body.image).toBeNull();
    });

    it('starts a Variant with no image', async () => {
      const p = await product();
      const { body: variant } = await admin
        .post(`/api/admin/products/${p.id}/variants`)
        .send({ sku: `SKU-${randomUUID()}`, stock: 1, optionValueIds: [] })
        .expect(201);
      expect(variant.image).toBeNull();
    });
  });

  it('shows Product and Variant images on the storefront, with the main image in the listing', async () => {
    const [main, second, red] = [await upload(), await upload(), await upload()];
    const { body: category } = await admin.post('/api/admin/categories').send({ name: `Tops ${randomUUID().slice(0, 8)}` }).expect(201);
    const { body: p } = await admin
      .post('/api/admin/products')
      .send({ name: 'Pictured tee', description: '', categoryId: category.id, price: 100_000, optionTypeIds: [], images: [main, second] })
      .expect(201);
    const { body: variant } = await admin
      .post(`/api/admin/products/${p.id}/variants`)
      .send({ sku: `SKU-${randomUUID()}`, stock: 1, optionValueIds: [], image: red })
      .expect(201);

    const { body: page } = await t.http().get(`/api/products/${p.id}`).expect(200);
    expect(page.images).toEqual([main, second]);
    expect(page.variants).toEqual([expect.objectContaining({ id: variant.id, image: red })]);
    const { body: list } = await t.http().get(`/api/products?categoryId=${category.id}`).expect(200);
    expect(list.items).toEqual([expect.objectContaining({ id: p.id, image: main })]);
  });
});
