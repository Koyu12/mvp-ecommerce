'use client';

import type { AdminOrder } from '@mvp/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '../../../../lib/api';
import { formatIdr } from '../../../../lib/format';
import { useSubmit } from '../../../../lib/use-submit';
import { AdminOnly } from '../../admin-only';

function OrderDetail({ id }: { id: string }) {
  const [order, setOrder] = useState<AdminOrder | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<AdminOrder>(`/admin/orders/${id}`).then((r) => {
      setOrder(r.data);
      if (r.error) setError(r.error.status === 404 ? 'Order not found.' : 'Could not load the order.');
    });
  }, [id]);

  const ship = useSubmit(async (form) => {
    const result = await api<AdminOrder>(`/admin/orders/${id}/ship`, 'POST', {
      courier: form.get('courier'),
      trackingNumber: form.get('trackingNumber'),
    });
    if (result.data) setOrder(result.data);
    return result;
  });
  const cancel = useSubmit(async () => {
    if (!confirm('Cancel this order and return its Stock? Refund a paid order by hand in Midtrans.')) return;
    const result = await api<AdminOrder>(`/admin/orders/${id}/cancel`, 'POST');
    if (result.data) setOrder(result.data);
    return result;
  });
  const complete = useSubmit(async () => {
    const result = await api<AdminOrder>(`/admin/orders/${id}/complete`, 'POST');
    if (result.data) setOrder(result.data);
    return result;
  });

  if (error) return <p role="alert">{error}</p>;
  if (!order) return null;
  const a = order.address;
  return (
    <>
      <h1>Order {order.number}</h1>
      <p>
        Status: {order.status} · placed {new Date(order.createdAt).toLocaleString('id-ID')}
      </p>
      <h2>Customer</h2>
      <p>
        {order.customer.name} · {order.customer.email}
      </p>
      <h2>Items</h2>
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
      <h2>Payment</h2>
      <p>
        {order.status === 'pending_payment' ? 'Not paid yet.' : `Order status: ${order.status}.`}
        {order.paymentUrl && (
          <>
            {' '}
            Midtrans payment page: <a href={order.paymentUrl}>{order.paymentUrl}</a>
          </>
        )}
      </p>
      {order.shipment && (
        <>
          <h2>Shipment</h2>
          <p>
            {order.shipment.courier} · tracking {order.shipment.trackingNumber} · shipped{' '}
            {new Date(order.shipment.shippedAt).toLocaleString('id-ID')}
          </p>
        </>
      )}
      {order.status === 'paid' && (
        <form onSubmit={ship.onSubmit}>
          <h2>Ship</h2>
          <label>
            Courier <input name="courier" maxLength={50} required />
          </label>{' '}
          <label>
            Tracking number <input name="trackingNumber" maxLength={100} required />
          </label>
          {ship.error && <p role="alert">{ship.error}</p>}
          <button disabled={ship.pending}>Mark shipped</button>
        </form>
      )}
      {(order.status === 'pending_payment' || order.status === 'paid') && (
        <form onSubmit={cancel.onSubmit}>
          {cancel.error && <p role="alert">{cancel.error}</p>}
          <button disabled={cancel.pending}>Cancel order</button>
        </form>
      )}
      {order.status === 'shipped' && (
        <form onSubmit={complete.onSubmit}>
          {complete.error && <p role="alert">{complete.error}</p>}
          <button disabled={complete.pending}>Mark completed</button>
        </form>
      )}
    </>
  );
}

export default function AdminOrderPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <AdminOnly>
      <p>
        <Link href="/admin/orders">All orders</Link>
      </p>
      <OrderDetail id={id} />
    </AdminOnly>
  );
}
