import type { Prisma } from '@prisma/client';
import type { StoreSettings } from '@mvp/shared';

// The one settings row, inserted with the default Shipping fee by its migration.
export const SETTINGS_ID = 1;
export const SETTINGS_FIELDS = { shippingFee: true } as const;

// Read path for Cart and checkout. Takes a transaction client too, so checkout can snapshot the fee
// in the same transaction that creates the Order.
export function readStoreSettings(db: Prisma.TransactionClient): Promise<StoreSettings> {
  return db.storeSettings.findUniqueOrThrow({ where: { id: SETTINGS_ID }, select: SETTINGS_FIELDS });
}
