import { BadGatewayException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { type Order, PAYMENT_WINDOW_MS } from '@mvp/shared';
import { EmailQueue, orderEmailJobId } from '../email/email.queue';
import { PrismaService } from '../infra/prisma.service';
import { isPaidStatus, isValidSignature } from './midtrans';
import type { MidtransNotification } from './notification.schema';
import { PaymentGateway } from './payment-gateway';

const webUrl = () => process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: PaymentGateway,
    private readonly emails: EmailQueue,
  ) {}

  // Returns the Order's payment page URL, creating the Snap payment the first time. A second Snap payment for the
  // same order_id would invalidate the first, so the Order row stays locked while one request creates it.
  async start(order: Order, email: string): Promise<string> {
    return this.prisma.$transaction(
      async (tx) => {
        const [row] = await tx.$queryRaw<[{ paymentUrl: string | null }]>`SELECT "paymentUrl" FROM "order" WHERE id = ${order.id} FOR UPDATE`;
        if (row.paymentUrl) return row.paymentUrl;
        let paymentUrl: string;
        try {
          paymentUrl = await this.gateway.createPayment({
            orderNumber: order.number,
            total: order.total,
            items: [
              ...order.items.map((i) => ({ id: i.sku, name: [i.productName, ...i.options].join(' '), price: i.unitPrice, quantity: i.quantity })),
              { id: 'SHIPPING', name: 'Shipping fee', price: order.shippingFee, quantity: 1 },
            ],
            customer: { name: order.address.recipientName, email, phone: order.address.phone },
            startTime: new Date(order.createdAt),
            expiryMinutes: PAYMENT_WINDOW_MS / 60_000,
            finishUrl: `${webUrl()}/orders/${order.id}`,
          });
        } catch (error) {
          this.logger.error(`Could not start the payment for ${order.number}`, error);
          throw new BadGatewayException('The payment could not be started. Please try again.');
        }
        await tx.order.update({ where: { id: order.id }, data: { paymentUrl } });
        return paymentUrl;
      },
      // Midtrans answers within seconds; give concurrent duplicates room to wait for the lock.
      { maxWait: 20_000, timeout: 20_000 },
    );
  }

  // Applies a Midtrans notification. Idempotent: the status-guarded update pays an Order once, so duplicates,
  // late `pending`s and a `settlement` after a card `capture` change nothing and queue no email.
  async notify(n: MidtransNotification): Promise<void> {
    if (!isValidSignature(n, process.env.MIDTRANS_SERVER_KEY ?? '')) throw new UnauthorizedException('Invalid signature');
    if (!isPaidStatus(n)) return;
    const [order] = await this.prisma.order.updateManyAndReturn({
      where: { number: n.order_id, status: 'pending_payment', total: Number(n.gross_amount) },
      data: { status: 'paid' },
      select: { id: true, number: true, total: true, user: { select: { email: true } } },
    });
    if (!order) return;

    const link = `${webUrl()}/orders/${order.id}`;
    const admins = await this.prisma.user.findMany({ where: { role: 'admin' }, select: { email: true } });
    // After the update. If Redis is down the Order stays paid and only the email is lost (accepted in the spec).
    await this.queue(orderEmailJobId(order.id, 'paid'), {
      to: order.user.email,
      subject: `Payment received for Order ${order.number}`,
      text: `We received your payment of Rp${order.total} for Order ${order.number}. We will ship it soon.\nSee your Order: ${link}`,
    });
    if (admins.length) {
      await this.queue(orderEmailJobId(order.id, 'paid-admin'), {
        to: admins.map((a) => a.email).join(', '),
        subject: `New paid Order ${order.number}`,
        text: `Order ${order.number} is paid (Rp${order.total}) and ready to ship.`,
      });
    }
  }

  private async queue(jobId: string, email: { to: string; subject: string; text: string }): Promise<void> {
    try {
      await this.emails.enqueue(email, jobId);
    } catch (error) {
      this.logger.error(`Could not queue the email ${jobId}`, error);
    }
  }
}
