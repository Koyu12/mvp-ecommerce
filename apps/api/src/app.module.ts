import { BullModule } from '@nestjs/bullmq';
import { INestApplication, Module } from '@nestjs/common';
import { toNodeHandler } from 'better-auth/node';
import { AccountModule } from './account/account.module';
import { Auth, AUTH } from './auth/auth';
import { AuthModule } from './auth/auth.module';
import { CartModule } from './cart/cart.module';
import { CatalogModule } from './catalog/catalog.module';
import { EmailModule } from './email/email.module';
import { HealthModule } from './health/health.module';
import { InfraModule } from './infra/infra.module';
import { MediaModule } from './media/media.module';
import { SettingsModule } from './settings/settings.module';

@Module({
  imports: [
    // Root queue config, shared by every feature that registers a queue.
    // A factory so the env is read at boot, after the test harness has set it.
    BullModule.forRootAsync({
      useFactory: () => ({
        connection: { url: process.env.REDIS_URL ?? 'redis://localhost:6379' },
        prefix: process.env.QUEUE_PREFIX ?? 'bull',
      }),
    }),
    InfraModule,
    EmailModule,
    AuthModule,
    HealthModule,
    AccountModule,
    MediaModule,
    SettingsModule,
    CatalogModule,
    CartModule,
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
