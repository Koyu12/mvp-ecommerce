import { HealthResponse } from '@mvp/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, TestApp } from './test-app';

describe('GET /api/health', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  it('reports the database and Redis up, with the time from the clock', async () => {
    t.clock.set(new Date('2026-11-25T10:00:00.000Z'));

    const res = await t.http().get('/api/health').expect(200);

    expect(HealthResponse.parse(res.body)).toEqual({
      status: 'ok',
      database: 'up',
      redis: 'up',
      time: '2026-11-25T10:00:00.000Z',
    });
  });
});
