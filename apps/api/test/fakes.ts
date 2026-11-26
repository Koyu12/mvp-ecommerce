import type { SentMessageInfo, Transport } from 'nodemailer';
import { Clock } from '../src/clock';
import type { MailInput } from '../src/mail';

type MailMessage = Parameters<Transport['send']>[0];

export class FakeClock extends Clock {
  private current = new Date('2026-01-01T00:00:00.000Z');

  now(): Date {
    return new Date(this.current);
  }

  set(date: Date): void {
    this.current = new Date(date);
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

// A real Nodemailer transport that records each message instead of sending it.
export class CapturingMailTransport implements Transport<SentMessageInfo> {
  name = 'capturing';
  version = '1';
  sent: MailInput[] = [];
  /** Number of upcoming sends to reject, to simulate an SMTP outage. */
  failNext = 0;

  send(mail: MailMessage, callback: (err: Error | null, info: SentMessageInfo) => void): void {
    if (this.failNext > 0) {
      this.failNext--;
      return callback(new Error('SMTP unavailable'), { envelope: mail.message.getEnvelope(), messageId: '' });
    }
    this.sent.push(mail.data);
    callback(null, { envelope: mail.message.getEnvelope(), messageId: mail.message.messageId() });
  }
}
