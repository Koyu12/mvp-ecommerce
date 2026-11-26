import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { PAYMENT_WINDOW_MS } from '@mvp/shared';
import type { Queue } from 'bullmq';
import { Clock } from '../infra/clock';
import { OrdersService } from '../orders/orders.service';

export const ORDER_EXPIRY_QUEUE = 'order-expiry';

// Every minute, settles each pending_payment Order past its payment deadline against Midtrans Get Status (ADR 0003).
@Processor(ORDER_EXPIRY_QUEUE)
export class OrderExpiryProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(OrderExpiryProcessor.name);

  constructor(
    @InjectQueue(ORDER_EXPIRY_QUEUE) private readonly queue: Queue,
    private readonly clock: Clock,
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
    const due = await this.orders.unpaidCreatedBefore(new Date(this.clock.now().getTime() - PAYMENT_WINDOW_MS));
    for (const order of due) {
      // One failing Order must not hold up the rest; the next run retries it.
      try {
        await this.orders.settleUnpaid(order);
      } catch (error) {
        this.logger.error(`Could not settle the unpaid Order ${order.number}`, error);
      }
    }
  }
}
