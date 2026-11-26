import { z } from 'zod';
import type { StockState } from './catalog';

// Cart. It holds Variants and quantities only; prices and Stock are read live on every Cart read.
export const MAX_CART_QUANTITY = 99;
const cartQuantity = z.int().min(1).max(MAX_CART_QUANTITY);
export const CartItemInput = z.object({ variantId: z.string().min(1), quantity: cartQuantity });
export type CartItemInput = z.input<typeof CartItemInput>;
export const CartQuantity = z.object({ quantity: cartQuantity });
export type CartQuantity = z.input<typeof CartQuantity>;
// archived: the Variant or its Product is no longer sold.
export type CartAvailability = StockState | 'archived';
export type CartLine = {
  variantId: string;
  productId: string;
  productName: string;
  sku: string;
  options: string[];
  quantity: number;
  // Live effective price, and the one the Customer saw when they last added the item.
  unitPrice: number;
  addedPrice: number;
  priceChanged: boolean;
  lineTotal: number;
  stock: number;
  availability: CartAvailability;
};
// subtotal counts only lines that can be bought now (not archived, not out of stock). shippingFee is the
// live Store setting, or 0 when no line can be bought; total = subtotal + shippingFee. Checkout snapshots both.
export type Cart = { items: CartLine[]; subtotal: number; shippingFee: number; total: number };
