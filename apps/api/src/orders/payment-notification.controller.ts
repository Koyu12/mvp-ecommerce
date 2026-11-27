import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { parseBody } from '../common/parse-body';
import { MidtransNotification } from '../payments/notification.schema';
import { OrdersService } from './orders.service';

// Midtrans calls this with no session; the signature is the authentication.
@Controller('payments')
export class PaymentNotificationController {
  constructor(private readonly orders: OrdersService) {}

  // 200 for duplicates and statuses we ignore, so Midtrans stops retrying.
  @Post('notification')
  @HttpCode(200)
  async notification(@Body() body: unknown): Promise<void> {
    await this.orders.applyPaymentNotification(parseBody(MidtransNotification, body));
  }
}
