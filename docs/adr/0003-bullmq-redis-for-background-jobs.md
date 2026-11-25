# BullMQ on Redis for background jobs

Emails, the unpaid-Order expiry sweep and the shipped-Order auto-complete run as BullMQ jobs via `@nestjs/bullmq`, backed by a Redis container. We chose it over pg-boss (no new service, but small community and no official NestJS module) and over cron plus inline email sending (no retries, and a slow mail provider would block checkout). Redis carries jobs only; Stock stays in PostgreSQL as decided in ADR 0002.

## Consequences

An Order is committed to PostgreSQL before its email job is queued in Redis, so a Redis outage at that moment loses the email but never the Order. An outbox table is the upgrade path if that becomes a problem.
