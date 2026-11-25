import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import type { HealthResponse } from '@mvp/shared';
import { Clock } from './clock';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';

const probe = (check: Promise<unknown>) => check.then(() => 'up' as const, () => 'down' as const);

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly clock: Clock,
  ) {}

  @Get()
  async check(): Promise<HealthResponse> {
    const [database, redis] = await Promise.all([probe(this.prisma.$queryRaw`SELECT 1`), probe(this.redis.ping())]);
    const ok = database === 'up' && redis === 'up';
    const body: HealthResponse = { status: ok ? 'ok' : 'degraded', database, redis, time: this.clock.now().toISOString() };
    if (!ok) throw new ServiceUnavailableException(body);
    return body;
  }
}
