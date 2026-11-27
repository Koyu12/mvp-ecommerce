import { Module } from '@nestjs/common';
import { AccountModule } from '../account/account.module';
import { AuthModule } from '../auth/auth.module';
import { CartModule } from '../cart/cart.module';
import { CatalogModule } from '../catalog/catalog.module';
import { EmailModule } from '../email/email.module';
import { PaymentsModule } from '../payments/payments.module';
import { SettingsModule } from '../settings/settings.module';
import { AdminOrdersController } from './admin-orders.controller';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PaymentNotificationController } from './payment-notification.controller';

@Module({
  imports: [AuthModule, AccountModule, CartModule, CatalogModule, EmailModule, PaymentsModule, SettingsModule],
  controllers: [OrdersController, AdminOrdersController, PaymentNotificationController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
