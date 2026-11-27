import { z } from 'zod';

// A Midtrans HTTP notification. Every value is a string; other fields vary by payment method and are dropped.
export const MidtransNotification = z.object({
  order_id: z.string(),
  status_code: z.string(),
  gross_amount: z.string(),
  signature_key: z.string(),
  transaction_status: z.string(),
  fraud_status: z.string().optional(),
});
export type MidtransNotification = z.infer<typeof MidtransNotification>;
