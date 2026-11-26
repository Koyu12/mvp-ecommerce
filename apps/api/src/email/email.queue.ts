import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { MailService } from './mail';

export const EMAIL_QUEUE = 'email';

export interface EmailJob {
  to: string;
  subject: string;
  text: string;
}

// Callers queue emails instead of sending inline, so a slow SMTP server never blocks a request (ADR 0003).
@Injectable()
export class EmailQueue {
  constructor(@InjectQueue(EMAIL_QUEUE) private readonly queue: Queue<EmailJob>) {}

  // A jobId makes a repeat enqueue a no-op while the first job is still queued, so retries never send twice.
  async enqueue(email: EmailJob, jobId?: string): Promise<void> {
    await this.queue.add('send', email, { jobId });
  }
}

// The job id of an Order's email for one event. BullMQ refuses custom ids with a single ':', so the spec's
// `<order>:<event>` is written with a '-'.
export const orderEmailJobId = (orderId: string, event: string) => `${orderId}-${event}`;

@Processor(EMAIL_QUEUE)
export class EmailProcessor extends WorkerHost {
  constructor(private readonly mail: MailService) {
    super();
  }

  async process(job: Job<EmailJob>): Promise<void> {
    await this.mail.send(job.data);
  }
}
