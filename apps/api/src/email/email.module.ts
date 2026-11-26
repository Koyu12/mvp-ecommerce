import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { EMAIL_QUEUE, EmailProcessor, EmailQueue } from './email.queue';
import { MAIL_TRANSPORT, MailService } from './mail';

@Module({
  imports: [
    BullModule.registerQueue({
      name: EMAIL_QUEUE,
      defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 5_000 }, removeOnComplete: true },
    }),
  ],
  providers: [
    MailService,
    EmailQueue,
    EmailProcessor,
    { provide: MAIL_TRANSPORT, useValue: process.env.SMTP_URL ?? 'smtp://localhost:1025' },
  ],
  exports: [EmailQueue, MailService],
})
export class EmailModule {}
