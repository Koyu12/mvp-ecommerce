import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { ORDER_COMPLETION_QUEUE, OrderCompletionProcessor } from './order-completion';
import { ORDER_EXPIRY_QUEUE, OrderExpiryProcessor } from './order-expiry';

@Module({
  imports: [
    // A failed sweep isn't retried: the next one runs a minute later.
    BullModule.registerQueue({ name: ORDER_EXPIRY_QUEUE, defaultJobOptions: { removeOnComplete: true, removeOnFail: 100 } }),
    BullModule.registerQueue({ name: ORDER_COMPLETION_QUEUE, defaultJobOptions: { removeOnComplete: true, removeOnFail: 100 } }),
    OrdersModule,
    PaymentsModule,
  ],
  providers: [OrderExpiryProcessor, OrderCompletionProcessor],
})
export class JobsModule {}
