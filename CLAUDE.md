## Git attribution

Commits and PRs are authored by the repo owner only. Never add `Co-Authored-By: Claude` trailers to commit messages, and never add "Generated with Claude Code" lines to PR or issue bodies.

## API folder structure

`apps/api/src/` uses NestJS feature modules. Only `main.ts` and `app.module.ts` sit at the root, and `AppModule` only imports feature modules.

Each feature folder (`auth/`, `account/`, `catalog/`, `cart/`, `settings/`, `media/`, `email/`, `health/`; later `orders/`, `payments/`, `jobs/`) holds:

- `<feature>.module.ts`: registers the feature's controllers and providers, and `exports` the services other features may use.
- `<name>.controller.ts`: HTTP only. Route, guard, `parseBody` with a schema, call a service, return its result. No Prisma calls.
- `<name>.service.ts`: business rules and Prisma queries. Other features use a feature through its exported service, never through its controller or its tables directly.
- Guards, adapters and scripts the feature owns (for example `auth/admin.guard.ts`, `media/presigner.ts`).

Shared folders:

- `infra/`: `InfraModule` (global) with `PrismaService`, `RedisService` and the clock.
- `common/`: small helpers used by several features, such as `parse-body.ts`.

External services (S3, mail, Midtrans) sit behind an injection token with a real adapter and a fake in tests, like `S3Presigner` and `MAIL_TRANSPORT`.

Tests stay flat in `apps/api/test/`, one `<feature>.spec.ts` per feature.

Put new files in their feature's folder. Never add feature code at the root of `src/`. Split a feature into subfolders only once one area of it has three or more files.

## Validation and shared types

Zod schemas and types live in `packages/shared/src/`, one file per feature mirroring the API modules (`auth.ts`, `account.ts`, `catalog.ts`, `cart.ts`, `settings.ts`, `media.ts`, plus `money.ts`). `index.ts` only re-exports. Import them from `@mvp/shared` in both the API and the web app; never copy a schema.

A schema only the API uses (for example a payment webhook payload or a job's data) lives in its module as `<name>.schema.ts`. No `dto/` folders.

## Agent skills

### Issue tracker

GitHub Issues on Koyu12/mvp-ecommerce, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five labels: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
