import { inject } from 'vitest';

process.env.DATABASE_URL = inject('databaseUrl');
process.env.REDIS_URL = inject('redisUrl');
// Every test file shares one Redis: a private queue prefix stops other files' workers taking our jobs.
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
process.env.QUEUE_PREFIX = `test-${crypto.randomUUID()}`;
