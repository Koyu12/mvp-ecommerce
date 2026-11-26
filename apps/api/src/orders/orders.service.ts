import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  type CheckoutInput,
  effectivePrice,
  formatOrderNumber,
  type Order,
  orderNumberDay,
  type OrderSummary,
  orderTotal,
  PAYMENT_WINDOW_MS,
  type ShortItem,
} from '@mvp/shared';
import { Prisma } from '@prisma/client';
import { EmailQueue, orderEmailJobId } from '../email/email.queue';
import { Clock } from '../infra/clock';
import { PrismaService } from '../infra/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { SettingsService } from '../settings/settings.service';

const SUMMARY_FIELDS = { id: true, number: true, status: true, total: true, createdAt: true } satisfies Prisma.OrderSelect;
const ORDER_FIELDS = {
  ...SUMMARY_FIELDS,
  subtotal: true,
  shippingFee: true,
  recipientName: true,
  phone: true,
  line1: true,
  line2: true,
  city: true,
  region: true,
  postalCode: true,
  paymentUrl: true,
  items: {
    orderBy: { position: 'asc' },
    select: { variantId: true, productName: true, sku: true, options: true, unitPrice: true, quantity: true, lineTotal: true },
  },
} satisfies Prisma.OrderSelect;
type OrderRow = Prisma.OrderGetPayload<{ select: typeof ORDER_FIELDS }>;

const toSummary = ({ createdAt, ...o }: Prisma.OrderGetPayload<{ select: typeof SUMMARY_FIELDS }>): OrderSummary => ({
  ...o,
  createdAt: createdAt.toISOString(),
});
const toOrder = ({ id, number, status, total, createdAt, subtotal, shippingFee, items, paymentUrl, ...address }: OrderRow): Order => ({
  ...toSummary({ id, number, status, total, createdAt }),
  subtotal,
  shippingFee,
  items,
  address,
  paymentUrl,
});

// Checkout and a Customer's Orders. Every read is scoped to the Customer, so another Customer's Order answers 404.
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly emails: EmailQueue,
    private readonly clock: Clock,
    private readonly payments: PaymentsService,
  ) {}

  // Buys the Customer's whole Cart as one pending_payment Order and starts its payment. Idempotent per Customer and key:
  // a repeat, or a concurrent duplicate, returns the first Order and changes nothing, except starting a payment that failed.
  async checkout(user: { id: string; email: string }, idempotencyKey: string, { addressId }: CheckoutInput): Promise<Order> {
    const existing = await this.findByKey(user.id, idempotencyKey);
    if (existing) return this.withPayment(existing, user.email);
    let orderId: string;
    try {
      orderId = await this.prisma.$transaction((tx) => this.place(tx, user.id, idempotencyKey, addressId), {
        // Concurrent checkouts queue on the same Variant rows, so give them room to wait their turn.
        maxWait: 10_000,
        timeout: 10_000,
      });
    } catch (error) {
      // A concurrent request with the same key won: its Order fails our insert on the unique key,
      // or its reservation leaves our Stock short. Either way, answer with its Order.
      const winner = await this.findByKey(user.id, idempotencyKey);
      if (winner) return this.withPayment(winner, user.email);
      throw error;
    }
    const order = await this.get(user.id, orderId);
    await this.queueCreatedEmail(user.email, order);
    return this.withPayment(order, user.email);
  }

  // A failed gateway call answers 502; retrying with the same key creates the payment then.
  private async withPayment(order: Order, email: string): Promise<Order> {
    if (order.status !== 'pending_payment' || order.paymentUrl) return order;
    return { ...order, paymentUrl: await this.payments.start(order, email) };
  }

  // shortcut: every Order in one response; add paging when Customers have many Orders.
  async list(userId: string): Promise<OrderSummary[]> {
    const rows = await this.prisma.order.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: SUMMARY_FIELDS,
    });
    return rows.map(toSummary);
  }

  async get(userId: string, id: string): Promise<Order> {
    const row = await this.prisma.order.findFirst({ where: { id, userId }, select: ORDER_FIELDS });
    if (!row) throw new NotFoundException();
    return toOrder(row);
  }

  private async findByKey(userId: string, idempotencyKey: string): Promise<Order | null> {
    const row = await this.prisma.order.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey } }, select: ORDER_FIELDS });
    return row && toOrder(row);
  }

  // One transaction: reprice from the catalog, reserve Stock (ADR 0002), create the Order with its copies, clear the Cart.
  private async place(tx: Prisma.TransactionClient, userId: string, idempotencyKey: string, addressId: string): Promise<string> {
    const address = await tx.address.findFirst({
      where: { id: addressId, userId },
      select: { recipientName: true, phone: true, line1: true, line2: true, city: true, region: true, postalCode: true },
    });
    if (!address) throw new NotFoundException('addressId: no such Address');

    const lines = await tx.cartItem.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'asc' }, { variantId: 'asc' }],
      select: {
        quantity: true,
        variant: {
          select: {
            id: true,
            sku: true,
            price: true,
            archived: true,
            optionValues: { orderBy: [{ optionType: { createdAt: 'asc' } }, { optionTypeId: 'asc' }], select: { value: true } },
            product: { select: { name: true, price: true, archived: true } },
          },
        },
      },
    });
    if (!lines.length) throw new BadRequestException('Your Cart is empty');

    // Reserve in Variant id order, so concurrent multi-item checkouts lock rows in the same order and can't deadlock.
    const short: ShortItem[] = [];
    for (const { quantity, variant: v } of [...lines].sort((a, b) => (a.variant.id < b.variant.id ? -1 : 1))) {
      const archived = v.archived || v.product.archived;
      const reserved =
        !archived && (await tx.$executeRaw`UPDATE variant SET stock = stock - ${quantity}, "updatedAt" = now() WHERE id = ${v.id} AND stock >= ${quantity}`);
      if (reserved) continue;
      const { stock } = await tx.variant.findUniqueOrThrow({ where: { id: v.id }, select: { stock: true } });
      short.push({ variantId: v.id, sku: v.sku, productName: v.product.name, requested: quantity, available: archived ? 0 : stock, archived });
    }
    if (short.length) {
      // Throwing rolls back every reservation above.
      throw new ConflictException({ statusCode: 409, error: 'Conflict', message: 'Some items are not available in that quantity', shortItems: short });
    }

    const items = lines.map(({ quantity, variant: v }, position) => {
      const unitPrice = effectivePrice(v, v.product);
      return {
        position,
        variantId: v.id,
        productName: v.product.name,
        sku: v.sku,
        options: v.optionValues.map((o) => o.value),
        unitPrice,
        quantity,
        lineTotal: unitPrice * quantity,
      };
    });
    const { shippingFee } = await this.settings.read(tx);
    const now = this.clock.now();
    const day = orderNumberDay(now);
    // Taken last, since it holds the day's counter row locked until commit.
    const [{ last }] = await tx.$queryRaw<[{ last: number }]>`
      INSERT INTO order_number_sequence (day, last) VALUES (${day}, 1)
      ON CONFLICT (day) DO UPDATE SET last = order_number_sequence.last + 1
      RETURNING last`;
    const order = await tx.order.create({
      data: {
        number: formatOrderNumber(now, last),
        userId,
        idempotencyKey,
        subtotal: orderTotal(items, 0),
        shippingFee,
        total: orderTotal(items, shippingFee),
        ...address,
        createdAt: now,
        items: { create: items },
      },
      select: { id: true },
    });
    await tx.cartItem.deleteMany({ where: { userId, variantId: { in: items.map((i) => i.variantId) } } });
    return order.id;
  }

  // After commit. If Redis is down the Order stands and only this email is lost (accepted in the spec).
  private async queueCreatedEmail(to: string, order: Order): Promise<void> {
    const deadline = new Date(Date.parse(order.createdAt) + PAYMENT_WINDOW_MS);
    const lines = order.items.map((i) => `${i.quantity} x ${i.productName} (${[i.sku, ...i.options].join(', ')}): Rp${i.lineTotal}`);
    const text = [
      `Thank you for your Order ${order.number}.`,
      ...lines,
      `Shipping: Rp${order.shippingFee}`,
      `Total: Rp${order.total}`,
      `Please pay by ${deadline.toISOString()}, or the Order expires.`,
      `See your Order: ${process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'}/orders/${order.id}`,
    ].join('\n');
    try {
      await this.emails.enqueue({ to, subject: `Order ${order.number} created`, text }, orderEmailJobId(order.id, 'created'));
    } catch (error) {
      this.logger.error(`Could not queue the created email for ${order.number}`, error);
    }
  }
}
