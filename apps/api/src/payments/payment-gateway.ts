// A payment for one Order. Item prices times quantities sum to `total`; the Shipping fee is one of the items.
export type PaymentRequest = {
  orderNumber: string;
  total: number;
  items: { id: string; name: string; price: number; quantity: number }[];
  customer: { name: string; email: string; phone: string };
  // The payment page expires `expiryMinutes` after this, the Order's creation.
  startTime: Date;
  expiryMinutes: number;
  // Where the payment page sends the Customer when done.
  finishUrl: string;
};

// A payment as Midtrans reports it, raw strings as sent (gross_amount is "160000.00").
export type PaymentStatus = { transaction_status: string; fraud_status?: string; gross_amount: string };

// The payment provider (Midtrans Snap in the app). Tests swap in a fake.
export abstract class PaymentGateway {
  /** Starts the payment and returns the URL of its payment page. */
  abstract createPayment(request: PaymentRequest): Promise<string>;
  /** The payment's latest status, or null when the provider has none: a Snap payment whose Customer never picked a method. */
  abstract getStatus(orderNumber: string): Promise<PaymentStatus | null>;
  /** Expires a pending payment so it can no longer be paid. */
  abstract expire(orderNumber: string): Promise<void>;
}
