// midtrans-client ships no types, and @types/midtrans-client is a stub. Only what the adapter uses.
declare module 'midtrans-client' {
  export class Snap {
    constructor(options: { isProduction: boolean; serverKey: string; clientKey: string });
    createTransaction(body: object): Promise<{ token: string; redirect_url: string }>;
  }
}
