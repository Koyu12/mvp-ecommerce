import { BullModule } from '@nestjs/bullmq';
import { INestApplication, Module } from '@nestjs/common';
import { toNodeHandler } from 'better-auth/node';
import { AccountModule } from './account/account.module';
import { Auth, AUTH } from './auth/auth';
import { AuthModule } from './auth/auth.module';
import { CartController } from './cart/cart.controller';
import { CATALOG_CONTROLLERS } from './catalog/catalog';
import { EmailModule } from './email/email.module';
import { HealthModule } from './health/health.module';
import { InfraModule } from './infra/infra.module';
import { MediaModule } from './media/media.module';
import { SettingsController } from './settings/settings.controller';

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
  ],
  // shortcut: catalog, cart and settings are still registered here directly, converted to feature modules in wave 2.
  controllers: [SettingsController, ...CATALOG_CONTROLLERS, CartController],
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
