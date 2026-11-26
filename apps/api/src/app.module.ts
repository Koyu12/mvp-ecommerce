import { BullModule } from '@nestjs/bullmq';
import { INestApplication, Module } from '@nestjs/common';
import { toNodeHandler } from 'better-auth/node';
import { Auth, AUTH, createAuth } from './auth';
import { Clock, SystemClock } from './clock';
import { EMAIL_QUEUE, EmailProcessor, EmailQueue } from './email.queue';
import { HealthController } from './health.controller';
import { MAIL_TRANSPORT, MailService } from './mail';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';

@Module({
  imports: [
    // A factory so the env is read at boot, after the test harness has set it.
    BullModule.forRootAsync({
      useFactory: () => ({
        connection: { url: process.env.REDIS_URL ?? 'redis://localhost:6379' },
        prefix: process.env.QUEUE_PREFIX ?? 'bull',
      }),
    }),
    BullModule.registerQueue({
      name: EMAIL_QUEUE,
      defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 5_000 }, removeOnComplete: true },
    }),
  ],
  controllers: [HealthController],
  providers: [
    PrismaService,
    RedisService,
    MailService,
    EmailQueue,
    EmailProcessor,
    { provide: AUTH, useFactory: createAuth, inject: [PrismaService, EmailQueue, Clock] },
    { provide: Clock, useClass: SystemClock },
    { provide: MAIL_TRANSPORT, useValue: process.env.SMTP_URL ?? 'smtp://localhost:1025' },
  ],
})
export class AppModule {}

// Shared by main.ts and the test harness so tests run the app as deployed.
export function configureApp<T extends INestApplication>(app: T): T {
  // Mounted before init() so it runs ahead of Nest's body parser: Better Auth reads the raw body itself.
  app.use('/api/auth', toNodeHandler(app.get<Auth>(AUTH)));
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  return app;
}
