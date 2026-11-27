import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { type AdminOrder, AdminOrderQuery, type AdminOrderSummary, ShipInput } from '@mvp/shared';
import { AdminGuard } from '../auth/admin.guard';
import { parseBody } from '../common/parse-body';
import { OrdersService } from './orders.service';

// Admin management of every Customer's Orders.
@Controller('admin/orders')
@UseGuards(AdminGuard)
export class AdminOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(@Query() query: unknown): Promise<AdminOrderSummary[]> {
    return this.orders.adminList(parseBody(AdminOrderQuery, query));
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<AdminOrder> {
    return this.orders.adminGet(id);
  }

  @Post(':id/ship')
  @HttpCode(200)
  ship(@Param('id') id: string, @Body() body: unknown): Promise<AdminOrder> {
    return this.orders.ship(id, parseBody(ShipInput, body));
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Param('id') id: string): Promise<AdminOrder> {
    return this.orders.adminCancel(id);
  }

  @Post(':id/complete')
  @HttpCode(200)
  complete(@Param('id') id: string): Promise<AdminOrder> {
    return this.orders.adminComplete(id);
  }
}
