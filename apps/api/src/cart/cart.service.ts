import { Injectable, NotFoundException } from '@nestjs/common';
import { type Cart, type CartAvailability, type CartItemInput, effectivePrice, MAX_CART_QUANTITY, stockState } from '@mvp/shared';
import { PrismaService } from '../infra/prisma.service';
import { SettingsService } from '../settings/settings.service';

// A Customer's one Cart: their cart_item rows. Every query is scoped to their userId, so
// another Customer's item answers 404 like one not in the Cart. Nothing here touches Stock.
@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async get(userId: string): Promise<Cart> {
    const rows = await this.prisma.cartItem.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'asc' }, { variantId: 'asc' }],
      select: {
        quantity: true,
        addedPrice: true,
        variant: {
          select: {
            id: true,
            sku: true,
            stock: true,
            price: true,
            archived: true,
            optionValues: { orderBy: [{ optionType: { createdAt: 'asc' } }, { optionTypeId: 'asc' }], select: { value: true } },
            product: { select: { id: true, name: true, price: true, archived: true } },
          },
        },
      },
    });
    const items = rows.map(({ quantity, addedPrice, variant: v }) => {
      const unitPrice = effectivePrice(v, v.product);
      const availability: CartAvailability = v.archived || v.product.archived ? 'archived' : stockState(v.stock, quantity);
      return {
        variantId: v.id,
        productId: v.product.id,
        productName: v.product.name,
        sku: v.sku,
        options: v.optionValues.map((o) => o.value),
        quantity,
        unitPrice,
        addedPrice,
        priceChanged: unitPrice !== addedPrice,
        lineTotal: unitPrice * quantity,
        stock: v.stock,
        availability,
      };
    });
    const billable = items.filter((i) => i.availability !== 'archived' && i.availability !== 'out_of_stock');
    const subtotal = billable.reduce((sum, i) => sum + i.lineTotal, 0);
    // Nothing to ship, so no fee.
    const shippingFee = billable.length ? (await this.settings.read()).shippingFee : 0;
    return { items, subtotal, shippingFee, total: subtotal + shippingFee };
  }

  // Adds to the quantity already in the Cart. The price seen is recorded only when the item is first added,
  // so a later price change stays flagged.
  async add(userId: string, { variantId, quantity }: CartItemInput): Promise<Cart> {
    const variant = await this.prisma.variant.findFirst({
      where: { id: variantId, archived: false, product: { archived: false } },
      select: { price: true, product: { select: { price: true } } },
    });
    if (!variant) throw new NotFoundException();
    // One statement, so concurrent adds never lose an increment.
    await this.prisma.$executeRaw`
      INSERT INTO cart_item ("userId", "variantId", quantity, "addedPrice", "updatedAt")
      VALUES (${userId}, ${variantId}, ${quantity}, ${effectivePrice(variant, variant.product)}, now())
      ON CONFLICT ("userId", "variantId") DO UPDATE
      SET quantity = LEAST(cart_item.quantity + EXCLUDED.quantity, ${MAX_CART_QUANTITY}), "updatedAt" = now()`;
    return this.get(userId);
  }

  // Sets the quantity, so repeating it changes nothing. Keeps the added price, so a price notice stays.
  async set(userId: string, variantId: string, quantity: number): Promise<Cart> {
    const { count } = await this.prisma.cartItem.updateMany({ where: { userId, variantId }, data: { quantity } });
    if (!count) throw new NotFoundException();
    return this.get(userId);
  }

  async remove(userId: string, variantId: string): Promise<Cart> {
    const { count } = await this.prisma.cartItem.deleteMany({ where: { userId, variantId } });
    if (!count) throw new NotFoundException();
    return this.get(userId);
  }
}
