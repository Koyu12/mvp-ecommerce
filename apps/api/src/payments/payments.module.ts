import { Module } from '@nestjs/common';
import { MidtransGateway } from './midtrans';
import { PaymentGateway } from './payment-gateway';

// The payment provider port and its Midtrans adapter. Orders owns what a payment does to an Order.
// isPaidStatus and the signature helpers in ./midtrans are plain functions: import them directly.
@Module({
  providers: [{ provide: PaymentGateway, useClass: MidtransGateway }],
  exports: [PaymentGateway],
})
export class PaymentsModule {}
