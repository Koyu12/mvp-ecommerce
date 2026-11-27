import { createHash, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { MidtransError, Snap } from 'midtrans-client';
import { PaymentGateway, type PaymentRequest, type PaymentStatus } from './payment-gateway';

// Midtrans wants WIB (UTC+7) wall-clock time with an explicit offset.
const toMidtransTime = (d: Date) => `${new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 19).replace('T', ' ')} +0700`;

// The Snap create-transaction body. Midtrans caps item ids and names at 50 characters.
export const snapTransaction = (r: PaymentRequest) => ({
  transaction_details: { order_id: r.orderNumber, gross_amount: r.total },
  item_details: r.items.map((i) => ({ ...i, id: i.id.slice(0, 50), name: i.name.slice(0, 50) })),
  customer_details: { first_name: r.customer.name, email: r.customer.email, phone: r.customer.phone },
  // Without start_time the countdown starts when the Customer picks a method, not at Order creation.
  expiry: { start_time: toMidtransTime(r.startTime), unit: 'minutes', duration: r.expiryMinutes },
  callbacks: { finish: r.finishUrl },
});

@Injectable()
export class MidtransGateway extends PaymentGateway {
  private readonly snap = new Snap({
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
    serverKey: process.env.MIDTRANS_SERVER_KEY ?? '',
    clientKey: process.env.MIDTRANS_CLIENT_KEY ?? '',
  });

  async createPayment(request: PaymentRequest): Promise<string> {
    return (await this.snap.createTransaction(snapTransaction(request))).redirect_url;
  }

  // Snap answers 404 until the Customer picks a payment method.
  async getStatus(orderNumber: string): Promise<PaymentStatus | null> {
    try {
      const { transaction_status, fraud_status, gross_amount } = await this.snap.transaction.status(orderNumber);
      return { transaction_status, fraud_status, gross_amount };
    } catch (error) {
      if (error instanceof MidtransError && Number(error.httpStatusCode) === 404) return null;
      throw error;
    }
  }

  async expire(orderNumber: string): Promise<void> {
    await this.snap.transaction.expire(orderNumber);
  }
}

type SignedFields = { order_id: string; status_code: string; gross_amount: string };

// Signs the raw strings Midtrans sent: gross_amount arrives as "160000.00", and rebuilding it from a number breaks the hash.
export const notificationSignature = (n: SignedFields, serverKey: string) =>
  createHash('sha512').update(n.order_id + n.status_code + n.gross_amount + serverKey).digest('hex');

export const isValidSignature = (n: SignedFields & { signature_key: string }, serverKey: string) => {
  // An empty key would let anyone compute a valid signature.
  if (!serverKey) return false;
  const expected = Buffer.from(notificationSignature(n, serverKey));
  const given = Buffer.from(n.signature_key.toLowerCase());
  return given.length === expected.length && timingSafeEqual(given, expected);
};

// The money is in: a settled payment, or a card capture that passed the fraud check. `capture` + `challenge` stays pending.
// Shared by the notification route and the expiry job.
export const isPaidStatus = (s: { transaction_status: string; fraud_status?: string }) =>
  s.transaction_status === 'settlement' || (s.transaction_status === 'capture' && s.fraud_status === 'accept');
