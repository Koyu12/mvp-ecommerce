import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { parseBody } from '../common/parse-body';
import { MidtransNotification } from './notification.schema';
import { PaymentsService } from './payments.service';

// Midtrans calls this with no session; the signature is the authentication.
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  // 200 for duplicates and statuses we ignore, so Midtrans stops retrying.
  @Post('notification')
  @HttpCode(200)
  async notification(@Body() body: unknown): Promise<void> {
    await this.payments.notify(parseBody(MidtransNotification, body));
  }
}
