import type { SentMessageInfo, Transport } from 'nodemailer';
import { Clock } from '../src/infra/clock';
import type { MailInput } from '../src/email/mail';
import { Presigner, type PresignRequest } from '../src/media/presigner';
import { PaymentGateway, type PaymentRequest, type PaymentStatus } from '../src/payments/payment-gateway';

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

export interface GoogleProfile {
  sub: string;
  email: string;
  name?: string;
  email_verified?: boolean;
}

// Stands in for Google's OAuth token endpoint, the only Google call in the code flow:
// Better Auth reads the user from the id_token it returns (trusted because it came over TLS from Google).
export class FakeGoogle {
  private profiles = new Map<string, GoogleProfile>();

  /** Returns the authorization code Google would hand back for this profile. */
  codeFor(profile: GoogleProfile): string {
    const code = crypto.randomUUID();
    this.profiles.set(code, profile);
    return code;
  }

  /** A `fetch` that answers Google's token endpoint and passes every other request through. */
  wrap(realFetch: typeof fetch): typeof fetch {
    return async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url !== 'https://oauth2.googleapis.com/token') return realFetch(input, init);
      const profile = this.profiles.get(new URLSearchParams(String(init?.body)).get('code') ?? '');
      if (!profile) return Response.json({ error: 'invalid_grant' }, { status: 400 });
      const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
      const claims = { iss: 'https://accounts.google.com', email_verified: true, name: 'Google User', ...profile };
      const idToken = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(claims)}.sig`;
      return Response.json({ access_token: 'fake-access', id_token: idToken, token_type: 'Bearer', expires_in: 3600 });
    };
  }
}

// Signs nothing: records each request and returns a recognisable upload URL.
export class FakePresigner extends Presigner {
  signed: PresignRequest[] = [];

  async presignPut(request: PresignRequest): Promise<string> {
    this.signed.push(request);
    return `https://storage.test/upload/${request.key}`;
  }
}

// Stands in for Midtrans Snap: records each payment and returns a recognisable redirect URL.
// Get Status answers what a test scripted in `statuses`, else null (404: the Customer never started paying).
export class FakePaymentGateway extends PaymentGateway {
  requests: PaymentRequest[] = [];
  /** Number of upcoming payments to reject, to simulate a Midtrans outage. */
  failNext = 0;

  async createPayment(request: PaymentRequest): Promise<string> {
    if (this.failNext > 0) {
      this.failNext--;
      throw new Error('Midtrans unavailable');
    }
    this.requests.push(request);
    return `https://pay.test/${request.orderNumber}`;
  }

  statuses = new Map<string, PaymentStatus>();
  /** Order numbers passed to expire, in call order. */
  expired: string[] = [];

  async getStatus(orderNumber: string): Promise<PaymentStatus | null> {
    return this.statuses.get(orderNumber) ?? null;
  }

  async expire(orderNumber: string): Promise<void> {
    this.expired.push(orderNumber);
  }
}
