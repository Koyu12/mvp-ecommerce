import { Inject, Injectable } from '@nestjs/common';
import { createTransport, type Mail } from 'nodemailer';

// Nodemailer transport: an SMTP URL in the app, a capturing transport in tests.
export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');

export type MailInput = Parameters<Mail['sendMail']>[0];

@Injectable()
export class MailService {
  private readonly mailer: Mail;

  constructor(@Inject(MAIL_TRANSPORT) transport: Parameters<typeof createTransport>[0]) {
    this.mailer = createTransport(transport, { from: process.env.MAIL_FROM ?? 'MVP Store <store@localhost>' });
  }

  async send(message: MailInput): Promise<void> {
    await this.mailer.sendMail(message);
  }
}
