import { BadRequestException, Body, Controller, Get, Headers, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { CheckoutInput, IdempotencyKey, type Order, type OrderSummary } from '@mvp/shared';
import { CurrentUser, SessionGuard, type SessionUser } from '../auth/session.guard';
import { parseBody } from '../common/parse-body';
import { OrdersService } from './orders.service';

// Checkout and the signed-in Customer's own Orders.
@Controller('orders')
@UseGuards(SessionGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  checkout(@CurrentUser() user: SessionUser, @Headers('idempotency-key') key: unknown, @Body() body: unknown): Promise<Order> {
    const parsed = IdempotencyKey.safeParse(key);
    if (!parsed.success) throw new BadRequestException('Idempotency-Key header is required (1 to 100 characters)');
    return this.orders.checkout(user, parsed.data, parseBody(CheckoutInput, body));
  }

  @Get()
  list(@CurrentUser() user: SessionUser): Promise<OrderSummary[]> {
    return this.orders.list(user.id);
  }

  @Get(':id')
  get(@CurrentUser() user: SessionUser, @Param('id') id: string): Promise<Order> {
    return this.orders.get(user.id, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: SessionUser, @Param('id') id: string): Promise<Order> {
    return this.orders.cancel(user.id, id);
  }
}
