import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import type { OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { Clock } from '../infra/clock';
import { OrdersService } from '../orders/orders.service';

export const ORDER_COMPLETION_QUEUE = 'order-completion';
export const COMPLETION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// Every hour, completes each Order shipped more than 7 days ago (ADR 0003).
@Processor(ORDER_COMPLETION_QUEUE)
export class OrderCompletionProcessor extends WorkerHost implements OnApplicationBootstrap {
  constructor(
    @InjectQueue(ORDER_COMPLETION_QUEUE) private readonly queue: Queue,
    private readonly clock: Clock,
    private readonly orders: OrdersService,
  ) {
    super();
  }

  async onApplicationBootstrap(): Promise<void> {
    // Tests call sweep() with a fake clock instead.
    if (process.env.ORDER_COMPLETION_SWEEP === 'off') return;
    // Upsert: every app instance runs this at boot and there is still one schedule.
    await this.queue.upsertJobScheduler('complete-shipped-orders', { every: 60 * 60_000 }, { name: 'sweep' });
  }

  async process(): Promise<void> {
    await this.sweep();
  }

  async sweep(): Promise<void> {
    await this.orders.completeShippedBefore(new Date(this.clock.now().getTime() - COMPLETION_WINDOW_MS));
  }
}
