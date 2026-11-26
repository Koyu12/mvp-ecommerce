import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { MidtransGateway } from './midtrans';
import { PaymentGateway } from './payment-gateway';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

// isPaidStatus in ./midtrans is a plain function: import it directly.
@Module({
  imports: [EmailModule],
  controllers: [PaymentsController],
  providers: [{ provide: PaymentGateway, useClass: MidtransGateway }, PaymentsService],
  exports: [PaymentGateway, PaymentsService],
})
export class PaymentsModule {}
