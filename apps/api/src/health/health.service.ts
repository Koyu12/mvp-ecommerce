import { Injectable } from '@nestjs/common';
import type { HealthResponse } from '@mvp/shared';
import { Clock } from '../infra/clock';
import { PrismaService } from '../infra/prisma.service';
import { RedisService } from '../infra/redis.service';

const probe = (check: Promise<unknown>) => check.then(() => 'up' as const, () => 'down' as const);

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly clock: Clock,
  ) {}

  async check(): Promise<HealthResponse> {
    const [database, redis] = await Promise.all([probe(this.prisma.$queryRaw`SELECT 1`), probe(this.redis.ping())]);
    const ok = database === 'up' && redis === 'up';
    return { status: ok ? 'ok' : 'degraded', database, redis, time: this.clock.now().toISOString() };
  }
}
