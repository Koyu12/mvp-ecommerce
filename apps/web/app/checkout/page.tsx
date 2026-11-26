'use client';

import type { Address, Cart, Order, ShortItem } from '@mvp/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { formatIdr } from '../../lib/format';
import { useSubmit } from '../../lib/use-submit';

export default function CheckoutPage() {
  const router = useRouter();
  // One key per visit to this page, reused on every retry, so a double click or a resent request makes one Order.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [cart, setCart] = useState<Cart | null>(null);
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [short, setShort] = useState<ShortItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([api<Cart>('/cart'), api<Address[]>('/addresses')]).then(([c, a]) => {
      setCart(c.data);
      setAddresses(a.data);
      if (c.error || a.error) setLoadError(c.error?.status === 401 ? 'Log in to check out.' : 'Could not load your cart.');
    });
  }, []);

  const { onSubmit, error, pending } = useSubmit(async (form) => {
    setShort([]);
    const result = await api<Order>('/orders', 'POST', { addressId: String(form.get('addressId')) }, { 'Idempotency-Key': idempotencyKey });
    if (result.data) router.push(`/orders/${result.data.id}`);
    const body = result.error?.body as { shortItems?: ShortItem[] } | null | undefined;
    if (body?.shortItems) setShort(body.shortItems);
    return result;
  });

  return (
    <main>
      <p>
        <Link href="/cart">Back to cart</Link>
      </p>
      <h1>Checkout</h1>
      {loadError && <p role="alert">{loadError}</p>}
      {cart && cart.items.length === 0 && <p>Your cart is empty.</p>}
      {cart && cart.items.length > 0 && addresses && (
        <form onSubmit={onSubmit}>
          <ul>
            {cart.items.map((line) => (
              <li key={line.variantId}>
                {line.quantity} x {line.productName}
                {line.options.length > 0 && ` (${line.options.join(', ')})`} · {formatIdr(line.lineTotal)}
              </li>
            ))}
          </ul>
          <p>Subtotal: {formatIdr(cart.subtotal)}</p>
          <p>Shipping fee: {formatIdr(cart.shippingFee)}</p>
          <p>
            Total: <strong>{formatIdr(cart.total)}</strong>
          </p>
          <fieldset>
            <legend>Ship to</legend>
            {addresses.length === 0 && (
              <p>
                No saved addresses. <Link href="/account">Add one</Link> first.
              </p>
            )}
            {addresses.map((a, i) => (
              <label key={a.id} style={{ display: 'block' }}>
                <input type="radio" name="addressId" value={a.id} defaultChecked={i === 0} required /> {a.recipientName}, {a.line1}
                {a.line2 && `, ${a.line2}`}, {a.city}, {a.region} {a.postalCode}
              </label>
            ))}
          </fieldset>
          {error && <p role="alert">{error}</p>}
          {short.length > 0 && (
            <ul role="alert">
              {short.map((s) => (
                <li key={s.variantId}>
                  {s.productName} ({s.sku}): {s.archived ? 'no longer available' : `you asked for ${s.requested}, only ${s.available} left`}
                </li>
              ))}
            </ul>
          )}
          <button disabled={pending || addresses.length === 0}>Place order</button>
        </form>
      )}
    </main>
  );
}
