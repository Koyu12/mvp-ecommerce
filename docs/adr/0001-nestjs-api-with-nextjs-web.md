# Separate NestJS API and Next.js web app in a pnpm monorepo

We build `apps/api` (NestJS) and `apps/web` (Next.js) in one pnpm/Turborepo monorepo, with Zod schemas shared through `packages/shared`. Business rules (orders, stock, payments) live in the API so they stay out of the UI layer. The web app proxies `/api/*` to the API so Better Auth session cookies stay same-origin. A Next.js-only app would be less work for an MVP; we accept two deployables for the cleaner boundary.
