import { z } from 'zod';
import { idr } from './money';

// Store settings, editable by Admins. The Shipping fee is integer IDR.
export const StoreSettings = z.object({ shippingFee: idr });
export type StoreSettings = z.infer<typeof StoreSettings>;
