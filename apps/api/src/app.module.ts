import { INestApplication, Module } from '@nestjs/common';
import { Clock, SystemClock } from './clock';
import { HealthController } from './health.controller';
import { MAIL_TRANSPORT, MailService } from './mail';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';

@Module({
  controllers: [HealthController],
  providers: [
    PrismaService,
    RedisService,
    MailService,
    { provide: Clock, useClass: SystemClock },
    { provide: MAIL_TRANSPORT, useValue: process.env.SMTP_URL ?? 'smtp://localhost:1025' },
  ],
})
export class AppModule {}

// Shared by main.ts and the test harness so tests run the app as deployed.
export function configureApp<T extends INestApplication>(app: T): T {
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  return app;
}
