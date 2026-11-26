import { BadGatewayException, BadRequestException, ConflictException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import {
  type AdminOrder,
  type AdminOrderSummary,
  type CheckoutInput,
  effectivePrice,
  formatOrderNumber,
  jakartaDayStart,
  type Order,
  orderNumberDay,
  type OrderStatus,
  type OrderSummary,
  orderTotal,
  PAYMENT_WINDOW_MS,
  type ShipInput,
  type ShortItem,
} from '@mvp/shared';
import { Prisma } from '@prisma/client';
import { AddressesService } from '../account/addresses.service';
import { UsersService } from '../auth/users.service';
import { CartService } from '../cart/cart.service';
import { StockService } from '../catalog/stock.service';
import { webUrl } from '../common/web-url';
import { EmailQueue, orderEmailJobId } from '../email/email.queue';
import { Clock } from '../infra/clock';
import { PrismaService } from '../infra/prisma.service';
import { isPaidStatus, isValidSignature } from '../payments/midtrans';
import type { MidtransNotification } from '../payments/notification.schema';
import { PaymentGateway } from '../payments/payment-gateway';
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
  courier: true,
  trackingNumber: true,
  shippedAt: true,
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
const toOrder = ({
  id,
  number,
  status,
  total,
  createdAt,
  subtotal,
  shippingFee,
  items,
  paymentUrl,
  courier,
  trackingNumber,
  shippedAt,
  ...address
}: OrderRow): Order => ({
  ...toSummary({ id, number, status, total, createdAt }),
  subtotal,
  shippingFee,
  items,
  address,
  paymentUrl,
  shipment: courier && trackingNumber && shippedAt ? { courier, trackingNumber, shippedAt: shippedAt.toISOString() } : null,
});
const CUSTOMER_FIELDS = { user: { select: { name: true, email: true } } } satisfies Prisma.OrderSelect;
const DAY_MS = 24 * 60 * 60 * 1000;
// Final failures. In Snap `deny` alone isn't final (the Customer may try another method), but past the deadline it is.
const FAILED = new Set(['expire', 'cancel', 'deny', 'failure']);

// Checkout and a Customer's Orders. Every read is scoped to the Customer, so another Customer's Order answers 404.
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly emails: EmailQueue,
    private readonly clock: Clock,
    private readonly gateway: PaymentGateway,
    private readonly cart: CartService,
    private readonly addresses: AddressesService,
    private readonly stock: StockService,
    private readonly users: UsersService,
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
    return { ...order, paymentUrl: await this.startPayment(order, email) };
  }

  // Returns the Order's payment page URL, creating the Snap payment the first time. A second Snap payment for the
  // same order_id would invalidate the first, so the Order row stays locked while one request creates it.
  private async startPayment(order: Order, email: string): Promise<string> {
    return this.prisma.$transaction(
      async (tx) => {
        const [row] = await tx.$queryRaw<[{ paymentUrl: string | null }]>`SELECT "paymentUrl" FROM "order" WHERE id = ${order.id} FOR UPDATE`;
        if (row.paymentUrl) return row.paymentUrl;
        let paymentUrl: string;
        try {
          paymentUrl = await this.gateway.createPayment({
            orderNumber: order.number,
            total: order.total,
            items: [
              ...order.items.map((i) => ({ id: i.sku, name: [i.productName, ...i.options].join(' '), price: i.unitPrice, quantity: i.quantity })),
              { id: 'SHIPPING', name: 'Shipping fee', price: order.shippingFee, quantity: 1 },
            ],
            customer: { name: order.address.recipientName, email, phone: order.address.phone },
            startTime: new Date(order.createdAt),
            expiryMinutes: PAYMENT_WINDOW_MS / 60_000,
            finishUrl: `${webUrl()}/orders/${order.id}`,
          });
        } catch (error) {
          this.logger.error(`Could not start the payment for ${order.number}`, error);
          throw new BadGatewayException('The payment could not be started. Please try again.');
        }
        await tx.order.update({ where: { id: order.id }, data: { paymentUrl } });
        return paymentUrl;
      },
      // Midtrans answers within seconds; give concurrent duplicates room to wait for the lock.
      { maxWait: 20_000, timeout: 20_000 },
    );
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

  // Admin views of every Customer's Orders.
  // shortcut: every matching Order in one response; add paging when the Admin list grows past a few thousand.
  async adminList({ status, from, to }: { status?: Order['status']; from?: string; to?: string }): Promise<AdminOrderSummary[]> {
    const rows = await this.prisma.order.findMany({
      where: {
        status,
        createdAt: { gte: from ? jakartaDayStart(from) : undefined, lt: to ? new Date(jakartaDayStart(to).getTime() + DAY_MS) : undefined },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { ...SUMMARY_FIELDS, ...CUSTOMER_FIELDS },
    });
    return rows.map(({ user, ...o }) => ({ ...toSummary(o), customer: user }));
  }

  async adminGet(id: string): Promise<AdminOrder> {
    const row = await this.prisma.order.findUnique({ where: { id }, select: { ...ORDER_FIELDS, ...CUSTOMER_FIELDS } });
    if (!row) throw new NotFoundException();
    const { user, ...order } = row;
    return { ...toOrder(order), customer: user };
  }

  // paid -> shipped, once: the status-guarded update ships an Order a single time, so a repeat returns it unchanged.
  async ship(id: string, { courier, trackingNumber }: ShipInput): Promise<AdminOrder> {
    const { count } = await this.prisma.order.updateMany({
      where: { id, status: 'paid' },
      data: { status: 'shipped', courier, trackingNumber, shippedAt: this.clock.now() },
    });
    const order = await this.guarded(count > 0, () => this.adminGet(id), 'shipped', (s) => `Only a paid Order can be shipped; this one is ${s}`);
    if (!count) return order;
    await this.emails.enqueueAfterCommit(
      {
        to: order.customer.email,
        subject: `Order ${order.number} shipped`,
        text: [
          `Your Order ${order.number} is on its way.`,
          `Courier: ${courier}`,
          `Tracking number: ${trackingNumber}`,
          `See your Order: ${webUrl()}/orders/${id}`,
        ].join('\n'),
      },
      orderEmailJobId(id, 'shipped'),
    );
    return order;
  }

  // The Admin cancels a pending_payment or paid Order through the same status-guarded end as the Customer, so a repeat
  // or a racing cancel or expiry returns Stock once. The refund of a paid Order is done by hand in Midtrans.
  async adminCancel(id: string): Promise<AdminOrder> {
    const before = await this.adminGet(id);
    const ended = await this.end(id, 'cancelled', { from: ['pending_payment', 'paid'] });
    const order = await this.guarded(ended, () => this.adminGet(id), 'cancelled', (s) => `Only a pending or paid Order can be cancelled; this one is ${s}`);
    if (!ended) return order;
    await this.queueEndedEmail(
      ended,
      'cancelled',
      `Your Order ${ended.number} has been cancelled by the Store. If you already paid, your payment will be refunded.\nSee your Order: ${webUrl()}/orders/${id}`,
    );
    if (before.status === 'pending_payment') await this.expirePayment(ended.number);
    return order;
  }

  // The Admin completes a shipped Order. A repeat returns it unchanged; any other status is refused.
  async adminComplete(id: string): Promise<AdminOrder> {
    return this.guarded(await this.complete(id), () => this.adminGet(id), 'completed', (s) => `Only a shipped Order can be completed; this one is ${s}`);
  }

  // The Customer confirms their own shipped Order arrived ("Order received"). A repeat returns it unchanged.
  async received(userId: string, id: string): Promise<Order> {
    return this.guarded(await this.complete(id, userId), () => this.get(userId, id), 'completed', (s) => `A ${s.replace('_', ' ')} Order can't be marked received`);
  }

  // shipped -> completed, guarded by status so the Customer, the Admin and the auto-complete job complete it once.
  private async complete(id: string, userId?: string): Promise<boolean> {
    const { count } = await this.prisma.order.updateMany({ where: { id, userId, status: 'shipped' }, data: { status: 'completed' } });
    return count > 0;
  }

  // The auto-complete job: completes every Order shipped before `shippedBefore`, with the same status guard.
  async completeShippedBefore(shippedBefore: Date): Promise<void> {
    await this.prisma.order.updateMany({ where: { status: 'shipped', shippedAt: { lt: shippedBefore } }, data: { status: 'completed' } });
  }

  // After a status-guarded change: the Order as it is now. When the change moved nothing, a repeat that already
  // reached `target` returns it unchanged and any other status answers 409 with `refusal`.
  private async guarded<T extends { status: OrderStatus }>(
    moved: unknown,
    current: () => Promise<T>,
    target: OrderStatus,
    refusal: (status: OrderStatus) => string,
  ): Promise<T> {
    const order = await current();
    if (!moved && order.status !== target) throw new ConflictException(refusal(order.status));
    return order;
  }

  private async findByKey(userId: string, idempotencyKey: string): Promise<Order | null> {
    const row = await this.prisma.order.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey } }, select: ORDER_FIELDS });
    return row && toOrder(row);
  }

  // One transaction: reprice from the catalog, reserve Stock (ADR 0002), create the Order with its copies, clear the Cart.
  private async place(tx: Prisma.TransactionClient, userId: string, idempotencyKey: string, addressId: string): Promise<string> {
    const address = await this.addresses.getOwned(tx, userId, addressId);
    if (!address) throw new NotFoundException('addressId: no such Address');

    const lines = await this.cart.checkoutLines(tx, userId);
    if (!lines.length) throw new BadRequestException('Your Cart is empty');

    // Archived Variants can't be bought, so they are not reserved and count as none left.
    const isArchived = (v: (typeof lines)[number]['variant']) => v.archived || v.product.archived;
    const toReserve = lines.filter((l) => !isArchived(l.variant)).map((l) => ({ variantId: l.variant.id, quantity: l.quantity }));
    const left = new Map((await this.stock.reserve(tx, toReserve)).map((s) => [s.variantId, s.available]));
    const short: ShortItem[] = lines
      .filter(({ variant: v }) => isArchived(v) || left.has(v.id))
      .map(({ quantity, variant: v }) => ({
        variantId: v.id,
        sku: v.sku,
        productName: v.product.name,
        requested: quantity,
        available: left.get(v.id) ?? 0,
        archived: isArchived(v),
      }));
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
    await this.cart.removeItems(tx, userId, items.map((i) => i.variantId));
    return order.id;
  }

  // The Customer cancels their own pending_payment Order. Repeating it changes nothing; any other status is refused.
  async cancel(userId: string, id: string): Promise<Order> {
    const ended = await this.end(id, 'cancelled', { userId });
    const order = await this.guarded(ended, () => this.get(userId, id), 'cancelled', (s) => `A ${s.replace('_', ' ')} Order can't be cancelled. Please contact the Store.`);
    if (!ended) return order;
    await this.queueEndedEmail(ended, 'cancelled', `Your Order ${ended.number} is cancelled and nothing will be charged.`);
    await this.expirePayment(ended.number);
    return order;
  }

  // So a cancelled Order's payment page or virtual account can't be paid later. Best effort: Midtrans may not know the Order yet (404).
  private async expirePayment(number: string): Promise<void> {
    try {
      await this.gateway.expire(number);
    } catch (error) {
      this.logger.warn(`Could not expire the payment for cancelled ${number}: ${String(error)}`);
    }
  }

  // The expiry job: pending_payment Orders placed before `createdBefore`, oldest first.
  unpaidCreatedBefore(createdBefore: Date): Promise<{ id: string; number: string }[]> {
    return this.prisma.order.findMany({
      where: { status: 'pending_payment', createdAt: { lt: createdBefore } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, number: true },
    });
  }

  // The expiry job: settles one unpaid Order past its deadline against Midtrans Get Status (ADR 0003).
  async settleUnpaid({ id, number }: { id: string; number: string }): Promise<void> {
    const status = await this.gateway.getStatus(number);
    // Null: the Customer never picked a payment method.
    if (!status || FAILED.has(status.transaction_status)) return this.expire(id);
    // The notification may have been lost: pay the Order the same way the notification would.
    if (isPaidStatus(status)) return this.markPaid(number, Number(status.gross_amount));
    // Midtrans then reports `expire`, which the next run acts on.
    if (status.transaction_status === 'pending') return this.gateway.expire(number);
    // shortcut: a card `capture` held for a fraud `challenge` waits for the Admin in the Midtrans dashboard; add a rule if those pile up.
    this.logger.warn(`Unpaid Order ${number} has payment status ${status.transaction_status}; left pending`);
  }

  // Applies a Midtrans notification. Idempotent: the status-guarded update pays an Order once, so duplicates,
  // late `pending`s and a `settlement` after a card `capture` change nothing and queue no email.
  async applyPaymentNotification(n: MidtransNotification): Promise<void> {
    if (!isValidSignature(n, process.env.MIDTRANS_SERVER_KEY ?? '')) throw new UnauthorizedException('Invalid signature');
    if (isPaidStatus(n)) await this.markPaid(n.order_id, Number(n.gross_amount));
  }

  // Pays a pending Order whose total matches the amount Midtrans received, and queues the paid emails once.
  // Shared by the notification and the expiry job; a no-op for an Order already paid, expired or cancelled.
  private async markPaid(orderNumber: string, amount: number): Promise<void> {
    const [order] = await this.prisma.order.updateManyAndReturn({
      where: { number: orderNumber, status: 'pending_payment', total: amount },
      data: { status: 'paid' },
      select: { id: true, number: true, total: true, user: { select: { email: true } } },
    });
    if (!order) return;

    const admins = await this.users.adminEmails();
    await this.emails.enqueueAfterCommit(
      {
        to: order.user.email,
        subject: `Payment received for Order ${order.number}`,
        text: `We received your payment of Rp${order.total} for Order ${order.number}. We will ship it soon.\nSee your Order: ${webUrl()}/orders/${order.id}`,
      },
      orderEmailJobId(order.id, 'paid'),
    );
    if (admins.length) {
      await this.emails.enqueueAfterCommit(
        { to: admins.join(', '), subject: `New paid Order ${order.number}`, text: `Order ${order.number} is paid (Rp${order.total}) and ready to ship.` },
        orderEmailJobId(order.id, 'paid-admin'),
      );
    }
  }

  // The expiry job ends an Order left unpaid past its deadline. A no-op unless it is still pending_payment.
  private async expire(id: string): Promise<void> {
    const ended = await this.end(id, 'expired');
    if (ended) await this.queueEndedEmail(ended, 'expired', `Your Order ${ended.number} expired because it was not paid in time.`);
  }

  // Moves an Order still in one of `from` (default pending_payment) to `status` and returns its Stock in one transaction.
  // The status guard makes a concurrent payment, cancel or expiry lose cleanly, so Stock comes back at most once.
  // Null when it already moved.
  private async end(id: string, status: 'cancelled' | 'expired', { userId, from = ['pending_payment'] }: { userId?: string; from?: OrderStatus[] } = {}) {
    return this.prisma.$transaction(async (tx) => {
      const [order] = await tx.order.updateManyAndReturn({
        where: { id, userId, status: { in: from } },
        data: { status },
        select: { id: true, number: true, user: { select: { email: true } } },
      });
      if (order) await this.releaseStock(tx, id);
      return order ?? null;
    });
  }

  // Returns an Order's reserved Stock. Call it in the transaction of the status-guarded update that ended the Order,
  // never on its own, or Stock could come back twice.
  private async releaseStock(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
    const items = await tx.orderItem.findMany({ where: { orderId }, select: { variantId: true, quantity: true } });
    await this.stock.release(tx, items);
  }

  private async queueEndedEmail(order: { id: string; number: string; user: { email: string } }, event: 'cancelled' | 'expired', text: string) {
    await this.emails.enqueueAfterCommit({ to: order.user.email, subject: `Order ${order.number} ${event}`, text }, orderEmailJobId(order.id, event));
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
      `See your Order: ${webUrl()}/orders/${order.id}`,
    ].join('\n');
    await this.emails.enqueueAfterCommit({ to, subject: `Order ${order.number} created`, text }, orderEmailJobId(order.id, 'created'));
  }
}
