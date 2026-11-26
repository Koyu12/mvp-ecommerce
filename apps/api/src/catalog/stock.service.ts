import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

type StockItem = { variantId: string; quantity: number };
// Variant id order, so concurrent multi-item transactions lock rows in the same order and can't deadlock.
const byVariant = (items: StockItem[]) => [...items].sort((a, b) => (a.variantId < b.variantId ? -1 : 1));

// Owns Variant Stock (ADR 0002). Both methods take the caller's transaction client, so a reservation rolls back
// with a failed checkout and a release commits with the status change that ended the Order.
@Injectable()
export class StockService {
  // Takes each quantity with one conditional UPDATE, so Stock never goes below zero. Returns the items it could not
  // take, with the Stock left; the caller throws to roll back the rest.
  async reserve(tx: Prisma.TransactionClient, items: StockItem[]): Promise<{ variantId: string; available: number }[]> {
    const short: { variantId: string; available: number }[] = [];
    for (const { variantId, quantity } of byVariant(items)) {
      const reserved = await tx.$executeRaw`UPDATE variant SET stock = stock - ${quantity}, "updatedAt" = now() WHERE id = ${variantId} AND stock >= ${quantity}`;
      if (reserved) continue;
      const { stock } = await tx.variant.findUniqueOrThrow({ where: { id: variantId }, select: { stock: true } });
      short.push({ variantId, available: stock });
    }
    return short;
  }

  // Gives reserved Stock back. Call it in the transaction of the status-guarded update that ended the Order,
  // never on its own, or Stock could come back twice.
  async release(tx: Prisma.TransactionClient, items: StockItem[]): Promise<void> {
    for (const { variantId, quantity } of byVariant(items)) {
      await tx.variant.update({ where: { id: variantId }, data: { stock: { increment: quantity } } });
    }
  }
}
