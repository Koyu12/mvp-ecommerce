## Git attribution

Commits and PRs are authored by the repo owner only. Never add `Co-Authored-By: Claude` trailers to commit messages, and never add "Generated with Claude Code" lines to PR or issue bodies.

## API folder structure

`apps/api/src/` is split by feature. Only `main.ts` and `app.module.ts` sit at the root.

- One folder per feature (`auth/`, `account/`, `health/`, `email/`; later `catalog/`, `cart/`, `orders/`, `payments/`, `jobs/`). A feature's controllers, services, guards and scripts live together in its folder.
- `infra/` holds shared infrastructure: `prisma.service.ts`, `redis.service.ts`, `clock.ts`.
- `common/` holds small helpers used by several features, such as `parse-body.ts`.
- Tests stay flat in `apps/api/test/`, one `<feature>.spec.ts` per feature.

Put new files in their feature's folder. Never add feature code at the root of `src/`.

## Agent skills

### Issue tracker

GitHub Issues on Koyu12/mvp-ecommerce, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five labels: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
