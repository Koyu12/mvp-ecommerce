// midtrans-client ships no types, and @types/midtrans-client is a stub. Only what the adapter uses.
declare module 'midtrans-client' {
  export class Snap {
    constructor(options: { isProduction: boolean; serverKey: string; clientKey: string });
    createTransaction(body: object): Promise<{ token: string; redirect_url: string }>;
    transaction: {
      status(orderId: string): Promise<{ transaction_status: string; fraud_status?: string; gross_amount: string }>;
      expire(orderId: string): Promise<object>;
    };
  }
  // httpStatusCode is a number for HTTP errors, but the body's string (e.g. "404") when Midtrans answers 200 with an error body.
  export class MidtransError extends Error {
    httpStatusCode: number | string | null;
  }
}
