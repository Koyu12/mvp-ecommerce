import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, UseGuards } from '@nestjs/common';
import { type Cart, CartItemInput, CartQuantity } from '@mvp/shared';
import { CurrentUser, SessionGuard, type SessionUser } from '../auth/session.guard';
import { parseBody } from '../common/parse-body';
import { CartService } from './cart.service';

// The signed-in Customer's one Cart.
@Controller('cart')
@UseGuards(SessionGuard)
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  get(@CurrentUser() user: SessionUser): Promise<Cart> {
    return this.cart.get(user.id);
  }

  @Post('items')
  @HttpCode(200)
  add(@CurrentUser() user: SessionUser, @Body() body: unknown): Promise<Cart> {
    return this.cart.add(user.id, parseBody(CartItemInput, body));
  }

  @Put('items/:variantId')
  set(@CurrentUser() user: SessionUser, @Param('variantId') variantId: string, @Body() body: unknown): Promise<Cart> {
    return this.cart.set(user.id, variantId, parseBody(CartQuantity, body).quantity);
  }

  @Delete('items/:variantId')
  remove(@CurrentUser() user: SessionUser, @Param('variantId') variantId: string): Promise<Cart> {
    return this.cart.remove(user.id, variantId);
  }
}
