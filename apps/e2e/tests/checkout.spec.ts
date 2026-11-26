import { expect, test } from '@playwright/test';

// Seeded by `pnpm --filter @mvp/api seed:e2e` (apps/api/test/e2e-seed.mts).
const EMAIL = 'e2e-customer@example.com';
const PASSWORD = 'e2e-password-123';
const PRODUCT_ID = 'e2e-product';

const hasSandboxKey = process.env.MIDTRANS_SERVER_KEY?.startsWith('SB-Mid-server-') ?? false;

test('a Customer checks out and reaches the Midtrans sandbox payment page', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.waitForURL('/');

  await page.goto(`/products/${PRODUCT_ID}`);
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await page.getByRole('link', { name: 'View cart' }).click();
  await expect(page.getByRole('link', { name: 'E2E Tee' })).toBeVisible();

  await page.getByRole('link', { name: 'Check out' }).click();
  await expect(page.getByRole('radio', { name: /E2E Customer, Jl\. Testing 1/ })).toBeChecked();

  // Without a sandbox key the API cannot create the payment, so stop before placing the Order.
  test.skip(!hasSandboxKey, 'MIDTRANS_SERVER_KEY is not a Midtrans sandbox key (SB-Mid-server-…); set it in the root .env or the shell.');
  await page.getByRole('button', { name: 'Place order' }).click();
  await page.waitForURL(/^https:\/\/app\.sandbox\.midtrans\.com\//);
});
