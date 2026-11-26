'use client';

import type { Order } from '@mvp/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { formatIdr } from '../../../lib/format';

export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<Order>(`/orders/${id}`).then((r) => {
      setOrder(r.data);
      if (r.error) setError(r.error.status === 401 ? 'Log in to see this order.' : r.error.status === 404 ? 'Order not found.' : 'Could not load the order.');
    });
  }, [id]);

  const a = order?.address;
  return (
    <main>
      <p>
        <Link href="/orders">All orders</Link>
      </p>
      {error && <p role="alert">{error}</p>}
      {order && a && (
        <>
          <h1>Order {order.number}</h1>
          <p>
            Status: {order.status} · placed {new Date(order.createdAt).toLocaleString('id-ID')}
          </p>
          {order.status === 'pending_payment' && order.paymentUrl && (
            <p>
              <a href={order.paymentUrl}>Pay now</a>
            </p>
          )}
          <ul>
            {order.items.map((i) => (
              <li key={`${i.variantId}-${i.sku}`}>
                {i.quantity} x {i.productName}
                {i.options.length > 0 && ` (${i.options.join(', ')})`} · SKU {i.sku} · {formatIdr(i.unitPrice)} each ·{' '}
                {formatIdr(i.lineTotal)}
              </li>
            ))}
          </ul>
          <p>Subtotal: {formatIdr(order.subtotal)}</p>
          <p>Shipping fee: {formatIdr(order.shippingFee)}</p>
          <p>
            Total: <strong>{formatIdr(order.total)}</strong>
          </p>
          <h2>Ship to</h2>
          <p>
            {a.recipientName} · {a.phone}
            <br />
            {a.line1}
            {a.line2 && `, ${a.line2}`}
            <br />
            {a.city}, {a.region} {a.postalCode}
          </p>
        </>
      )}
    </main>
  );
}
