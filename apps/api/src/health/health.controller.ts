import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import type { HealthResponse } from '@mvp/shared';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  async check(): Promise<HealthResponse> {
    const body = await this.health.check();
    if (body.status !== 'ok') throw new ServiceUnavailableException(body);
    return body;
  }
}
