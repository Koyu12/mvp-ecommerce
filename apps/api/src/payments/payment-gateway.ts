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

// The payment provider (Midtrans Snap in the app). Tests swap in a fake.
export abstract class PaymentGateway {
  /** Starts the payment and returns the URL of its payment page. */
  abstract createPayment(request: PaymentRequest): Promise<string>;
}
