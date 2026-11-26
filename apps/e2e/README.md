# Checkout E2E test

One Playwright test against the running stack: a seeded, verified Customer logs in, adds a Variant to the Cart, checks out with their Address and lands on the Midtrans sandbox payment page (`app.sandbox.midtrans.com`).

It is not part of `pnpm test` because it needs the whole stack running.

## Run it locally

1. Put Midtrans **sandbox** keys in the root `.env` (Compose and the test both read it):

   ```
   MIDTRANS_SERVER_KEY=SB-Mid-server-...
   MIDTRANS_CLIENT_KEY=SB-Mid-client-...
   ```

2. Start the stack: `docker compose up -d --build`.
3. Build the API once (the seed runs from `dist`): `pnpm --filter @mvp/api build`.
4. Install the browser once: `pnpm --filter @mvp/e2e exec playwright install chromium`.
5. Seed and run, with `DATABASE_URL` pointing at the Compose database:

   ```
   DATABASE_URL=postgresql://store:store@localhost:5432/store pnpm e2e
   ```

`pnpm e2e` runs `pnpm --filter @mvp/api seed:e2e` (`apps/api/src/e2e/seed.ts`), then the test. The seed is safe to run again: it resets the E2E Customer's Cart, Orders and Address and refills the Stock.

The test targets `http://localhost:3000`; set `E2E_BASE_URL` for another web origin. With `pnpm dev` instead of Compose, put the keys in `apps/api/.env` and in the shell or root `.env`.

Without a sandbox `MIDTRANS_SERVER_KEY` (one starting `SB-Mid-server-`) the test still logs in, adds to the Cart and opens checkout, then skips before placing the Order, with a message saying so.

## CI

Manual only. CI has no Midtrans sandbox keys, and without them the test skips the one step it exists for, so CI runs only its typecheck.
