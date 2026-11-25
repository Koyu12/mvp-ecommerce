# One build stage for the whole monorepo; `api` and `web` are the runnable targets.
# shortcut: the api image ships the full workspace with dev deps, prune with `pnpm deploy` before production.
FROM node:24-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/* \
  && corepack enable
WORKDIR /repo

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
# Next.js resolves the /api rewrite at build time.
ARG API_URL=http://api:3001
ENV API_URL=$API_URL
RUN pnpm build

FROM build AS api
WORKDIR /repo/apps/api
EXPOSE 3001
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/main.js"]

FROM node:24-slim AS web
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
