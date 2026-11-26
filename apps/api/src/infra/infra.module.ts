import { Global, Module } from '@nestjs/common';
import { Clock, SystemClock } from './clock';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';

// Global so every feature module can inject these without importing InfraModule.
@Global()
@Module({
  providers: [PrismaService, RedisService, { provide: Clock, useClass: SystemClock }],
  exports: [PrismaService, RedisService, Clock],
})
export class InfraModule {}
