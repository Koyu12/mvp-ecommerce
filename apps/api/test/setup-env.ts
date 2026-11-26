import { inject } from 'vitest';

process.env.DATABASE_URL = inject('databaseUrl');
process.env.REDIS_URL = inject('redisUrl');
// Every test file shares one Redis: a private queue prefix stops other files' workers taking our jobs.
process.env.QUEUE_PREFIX = `test-${crypto.randomUUID()}`;
