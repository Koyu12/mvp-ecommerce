import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { StoreSettings } from '@mvp/shared';
import { PrismaService } from '../infra/prisma.service';

// The one settings row, inserted with the default Shipping fee by its migration.
const SETTINGS_ID = 1;
const SETTINGS_FIELDS = { shippingFee: true } as const;

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  // Read path for Cart and checkout. Takes a transaction client too, so checkout can snapshot the fee
  // in the same transaction that creates the Order.
  read(db: Prisma.TransactionClient = this.prisma): Promise<StoreSettings> {
    return db.storeSettings.findUniqueOrThrow({ where: { id: SETTINGS_ID }, select: SETTINGS_FIELDS });
  }

  update(data: StoreSettings): Promise<StoreSettings> {
    return this.prisma.storeSettings.update({ where: { id: SETTINGS_ID }, data, select: SETTINGS_FIELDS });
  }
}
