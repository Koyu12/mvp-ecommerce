'use client';

import type { Cart, CartLine } from '@mvp/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { formatIdr } from '../admin/admin-only';

const availability = (line: CartLine) =>
  ({
    in_stock: 'In stock',
    low_stock: `Only ${line.stock} left`,
    out_of_stock: 'Out of stock',
    archived: 'No longer available. Remove it from your cart.',
  })[line.availability];

export default function CartPage() {
  const [cart, setCart] = useState<Cart | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = async (result: Promise<{ data: Cart | null; error: { status: number; message?: string } | null }>) => {
    const r = await result;
    if (r.data) setCart(r.data);
    setError(r.error?.status === 401 ? 'Log in to see your cart.' : r.error ? (r.error.message ?? 'Something went wrong.') : null);
  };

  useEffect(() => {
    void apply(api<Cart>('/cart'));
  }, []);

  return (
    <main>
      <p>
        <Link href="/products">Continue shopping</Link>
      </p>
      <h1>Your cart</h1>
      {error && (
        <p role="alert">
          {error} {!cart && <Link href="/login">Log in</Link>}
        </p>
      )}
      {cart && cart.items.length === 0 && <p>Your cart is empty.</p>}
      {cart && cart.items.length > 0 && (
        <>
          <ul>
            {cart.items.map((line) => (
              <li key={line.variantId}>
                <Link href={`/products/${line.productId}`}>{line.productName}</Link>
                {line.options.length > 0 && ` (${line.options.join(', ')})`} · {formatIdr(line.unitPrice)} ·{' '}
                <span>{availability(line)}</span>
                {line.priceChanged && <p>Price changed from {formatIdr(line.addedPrice)} since you added it.</p>}
                <p>
                  <label>
                    Quantity{' '}
                    <input
                      type="number"
                      min={1}
                      max={99}
                      defaultValue={line.quantity}
                      disabled={line.availability === 'archived'}
                      onBlur={(e) => {
                        const quantity = Number(e.target.value);
                        if (quantity !== line.quantity) void apply(api<Cart>(`/cart/items/${line.variantId}`, 'PUT', { quantity }));
                      }}
                    />
                  </label>{' '}
                  {formatIdr(line.lineTotal)}{' '}
                  <button onClick={() => void apply(api<Cart>(`/cart/items/${line.variantId}`, 'DELETE'))}>Remove</button>
                </p>
              </li>
            ))}
          </ul>
          <p>
            Subtotal: <strong>{formatIdr(cart.subtotal)}</strong> (Shipping fee added at checkout)
          </p>
        </>
      )}
    </main>
  );
}
