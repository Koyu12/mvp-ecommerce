import { hashPassword } from 'better-auth/crypto';
import { normaliseEmail } from '@mvp/shared';
import { PrismaClient } from '@prisma/client';

// Fixtures for the checkout E2E test in apps/e2e, which uses the same email, password and Product id.
export const E2E_EMAIL = 'e2e-customer@example.com';
export const E2E_PASSWORD = 'e2e-password-123';
export const E2E_PRODUCT_ID = 'e2e-product';

// A verified Customer with a password and one Address, plus an in-stock single-Variant Product.
// Safe to run again: it resets the Customer's Cart, Orders and Address and refills the Stock.
export async function seedE2e(prisma: PrismaClient) {
  const email = normaliseEmail(E2E_EMAIL);
  const password = await hashPassword(E2E_PASSWORD);
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { email },
      create: { id: 'e2e-customer', name: 'E2E Customer', email, emailVerified: true },
      update: { emailVerified: true, role: 'customer', banned: false },
    });
    // Better Auth keeps the password on the user's "credential" Account.
    await tx.account.deleteMany({ where: { userId: user.id, providerId: 'credential' } });
    await tx.account.create({
      data: { id: `${user.id}-credential`, accountId: user.id, providerId: 'credential', userId: user.id, password },
    });
    await tx.order.deleteMany({ where: { userId: user.id } });
    await tx.cartItem.deleteMany({ where: { userId: user.id } });
    await tx.address.deleteMany({ where: { userId: user.id } });
    await tx.address.create({
      data: {
        userId: user.id,
        recipientName: 'E2E Customer',
        phone: '081234567890',
        line1: 'Jl. Testing 1',
        city: 'Jakarta',
        region: 'DKI Jakarta',
        postalCode: '10110',
      },
    });

    const category = await tx.category.upsert({ where: { name: 'E2E' }, create: { name: 'E2E' }, update: {} });
    const product = { name: 'E2E Tee', description: 'Seeded for the checkout E2E test.', categoryId: category.id, price: 50000, archived: false };
    await tx.product.upsert({ where: { id: E2E_PRODUCT_ID }, create: { id: E2E_PRODUCT_ID, ...product }, update: product });
    await tx.variant.upsert({
      where: { sku: 'E2E-TEE' },
      create: { productId: E2E_PRODUCT_ID, sku: 'E2E-TEE', stock: 100 },
      update: { productId: E2E_PRODUCT_ID, stock: 100, archived: false, price: null },
    });
    return user;
  });
}

// `pnpm --filter @mvp/api seed:e2e` after a build, with DATABASE_URL pointing at the stack's database.
if (require.main === module) {
  const prisma = new PrismaClient();
  seedE2e(prisma)
    .then((user) => console.log(`E2E Customer ready: ${user.email}`))
    .finally(() => prisma.$disconnect());
}
