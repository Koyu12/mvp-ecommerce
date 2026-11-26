import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
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
  private readonly logger = new Logger(EmailQueue.name);

  constructor(@InjectQueue(EMAIL_QUEUE) private readonly queue: Queue<EmailJob>) {}

  // A jobId makes a repeat enqueue a no-op while the first job is still queued, so retries never send twice.
  async enqueue(email: EmailJob, jobId?: string): Promise<void> {
    await this.queue.add('send', email, { jobId });
  }

  // For an alert whose cause repeats (a retried notification, every expiry run) but must go out once: the job is kept
  // after sending, so its id stays taken. False when that id was already queued or sent.
  async enqueueOnce(email: EmailJob, jobId: string): Promise<boolean> {
    if (await this.queue.getJob(jobId)) return false;
    await this.queue.add('send', email, { jobId, removeOnComplete: false });
    return true;
  }

  // For an email sent after a change already committed: if Redis is down the change stands and only
  // this email is lost (accepted in the spec), so log instead of failing the request.
  async enqueueAfterCommit(email: EmailJob, jobId: string): Promise<void> {
    try {
      await this.enqueue(email, jobId);
    } catch (error) {
      this.logger.error(`Could not queue the email ${jobId}`, error);
    }
  }
}

// What an Order email is about. The Admin alerts ask for a refund or a check by hand.
export type OrderEmailEvent = 'created' | 'paid' | 'paid-admin' | 'shipped' | 'cancelled' | 'expired' | 'payment-mismatch' | 'paid-after-end';

// The job id of an Order's email for one event. BullMQ refuses custom ids with a single ':', so the spec's
// `<order>:<event>` is written with a '-'.
export const orderEmailJobId = (orderId: string, event: OrderEmailEvent) => `${orderId}-${event}`;

@Processor(EMAIL_QUEUE)
export class EmailProcessor extends WorkerHost {
  constructor(private readonly mail: MailService) {
    super();
  }

  async process(job: Job<EmailJob>): Promise<void> {
    await this.mail.send(job.data);
  }
}
