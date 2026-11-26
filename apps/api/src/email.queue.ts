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

  async enqueue(email: EmailJob): Promise<void> {
    await this.queue.add('send', email);
  }
}

@Processor(EMAIL_QUEUE)
export class EmailProcessor extends WorkerHost {
  constructor(private readonly mail: MailService) {
    super();
  }

  async process(job: Job<EmailJob>): Promise<void> {
    await this.mail.send(job.data);
  }
}
