import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { PAYMENT_WINDOW_MS } from '@mvp/shared';
import type { Queue } from 'bullmq';
import { Clock } from '../infra/clock';
import { PrismaService } from '../infra/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { isPaidStatus } from '../payments/midtrans';
import { PaymentGateway } from '../payments/payment-gateway';
import { PaymentsService } from '../payments/payments.service';

export const ORDER_EXPIRY_QUEUE = 'order-expiry';

// Final failures. In Snap `deny` alone isn't final (the Customer may try another method), but past the deadline it is.
const FAILED = new Set(['expire', 'cancel', 'deny', 'failure']);

// Every minute, settles each pending_payment Order past its payment deadline against Midtrans Get Status (ADR 0003).
@Processor(ORDER_EXPIRY_QUEUE)
export class OrderExpiryProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(OrderExpiryProcessor.name);

  constructor(
    @InjectQueue(ORDER_EXPIRY_QUEUE) private readonly queue: Queue,
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly gateway: PaymentGateway,
    private readonly payments: PaymentsService,
    private readonly orders: OrdersService,
  ) {
    super();
  }

  async onApplicationBootstrap(): Promise<void> {
    // Tests call sweep() with a fake clock instead.
    if (process.env.ORDER_EXPIRY_SWEEP === 'off') return;
    // Upsert: every app instance runs this at boot and there is still one schedule.
    await this.queue.upsertJobScheduler('expire-unpaid-orders', { every: 60_000 }, { name: 'sweep' });
  }

  async process(): Promise<void> {
    await this.sweep();
  }

  async sweep(): Promise<void> {
    const due = await this.prisma.order.findMany({
      where: { status: 'pending_payment', createdAt: { lt: new Date(this.clock.now().getTime() - PAYMENT_WINDOW_MS) } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, number: true },
    });
    for (const order of due) {
      // One failing Order must not hold up the rest; the next run retries it.
      try {
        await this.settle(order);
      } catch (error) {
        this.logger.error(`Could not settle the unpaid Order ${order.number}`, error);
      }
    }
  }

  private async settle({ id, number }: { id: string; number: string }): Promise<void> {
    const status = await this.gateway.getStatus(number);
    // Null: the Customer never picked a payment method.
    if (!status || FAILED.has(status.transaction_status)) return this.orders.expire(id);
    // The notification may have been lost: pay the Order the same way the notification would.
    if (isPaidStatus(status)) return this.payments.markPaid(number, Number(status.gross_amount));
    // Midtrans then reports `expire`, which the next run acts on.
    if (status.transaction_status === 'pending') return this.gateway.expire(number);
    // shortcut: a card `capture` held for a fraud `challenge` waits for the Admin in the Midtrans dashboard; add a rule if those pile up.
    this.logger.warn(`Unpaid Order ${number} has payment status ${status.transaction_status}; left pending`);
  }
}
