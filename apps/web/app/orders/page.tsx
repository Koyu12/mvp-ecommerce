'use client';

import type { OrderSummary } from '@mvp/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { formatIdr } from '../../lib/format';

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<OrderSummary[]>('/orders').then((r) => {
      setOrders(r.data);
      if (r.error) setError(r.error.status === 401 ? 'Log in to see your orders.' : 'Could not load your orders.');
    });
  }, []);

  return (
    <main>
      <h1>Your orders</h1>
      {error && <p role="alert">{error}</p>}
      {orders && orders.length === 0 && <p>No orders yet.</p>}
      <ul>
        {orders?.map((o) => (
          <li key={o.id}>
            <Link href={`/orders/${o.id}`}>{o.number}</Link> · {new Date(o.createdAt).toLocaleString('id-ID')} · {o.status} ·{' '}
            {formatIdr(o.total)}
          </li>
        ))}
      </ul>
    </main>
  );
}
