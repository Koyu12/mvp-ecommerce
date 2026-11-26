import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Post, Put, UseGuards } from '@nestjs/common';
import { type Cart, type CartAvailability, CartItemInput, CartQuantity, effectivePrice, LOW_STOCK } from '@mvp/shared';
import { CurrentUser, SessionGuard, type SessionUser } from '../auth/session.guard';
import { parseBody } from '../common/parse-body';
import { PrismaService } from '../infra/prisma.service';

const MAX_QUANTITY = 99;

// The signed-in Customer's one Cart: their cart_item rows. Every query is scoped to their userId, so
// another Customer's item answers 404 like one not in the Cart. Nothing here touches Stock.
@Controller('cart')
@UseGuards(SessionGuard)
export class CartController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async get(@CurrentUser() user: SessionUser): Promise<Cart> {
    const rows = await this.prisma.cartItem.findMany({
      where: { userId: user.id },
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
      const availability: CartAvailability =
        v.archived || v.product.archived ? 'archived'
        : v.stock === 0 ? 'out_of_stock'
        : v.stock <= LOW_STOCK || v.stock < quantity ? 'low_stock'
        : 'in_stock';
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
    const subtotal = items.reduce((sum, i) => (i.availability === 'archived' || i.availability === 'out_of_stock' ? sum : sum + i.lineTotal), 0);
    return { items, subtotal };
  }

  // Adds to the quantity already in the Cart, and records the price the Customer sees now.
  @Post('items')
  @HttpCode(200)
  async add(@CurrentUser() user: SessionUser, @Body() body: unknown): Promise<Cart> {
    const { variantId, quantity } = parseBody(CartItemInput, body);
    const variant = await this.prisma.variant.findFirst({
      where: { id: variantId, archived: false, product: { archived: false } },
      select: { price: true, product: { select: { price: true } } },
    });
    if (!variant) throw new NotFoundException();
    // One statement, so concurrent adds never lose an increment.
    await this.prisma.$executeRaw`
      INSERT INTO cart_item ("userId", "variantId", quantity, "addedPrice", "updatedAt")
      VALUES (${user.id}, ${variantId}, ${quantity}, ${effectivePrice(variant, variant.product)}, now())
      ON CONFLICT ("userId", "variantId") DO UPDATE
      SET quantity = LEAST(cart_item.quantity + EXCLUDED.quantity, ${MAX_QUANTITY}), "addedPrice" = EXCLUDED."addedPrice", "updatedAt" = now()`;
    return this.get(user);
  }

  // Sets the quantity, so repeating it changes nothing. Keeps the added price, so a price notice stays.
  @Put('items/:variantId')
  async set(@CurrentUser() user: SessionUser, @Param('variantId') variantId: string, @Body() body: unknown): Promise<Cart> {
    const { quantity } = parseBody(CartQuantity, body);
    const { count } = await this.prisma.cartItem.updateMany({ where: { userId: user.id, variantId }, data: { quantity } });
    if (!count) throw new NotFoundException();
    return this.get(user);
  }

  @Delete('items/:variantId')
  async remove(@CurrentUser() user: SessionUser, @Param('variantId') variantId: string): Promise<Cart> {
    const { count } = await this.prisma.cartItem.deleteMany({ where: { userId: user.id, variantId } });
    if (!count) throw new NotFoundException();
    return this.get(user);
  }
}
