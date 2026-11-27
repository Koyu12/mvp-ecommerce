'use client';

import { type AdminOrderSummary, ORDER_STATUSES } from '@mvp/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { formatIdr } from '../../../lib/format';
import { AdminOnly } from '../admin-only';

function Orders() {
  const [filters, setFilters] = useState({ status: '', from: '', to: '' });
  const [orders, setOrders] = useState<AdminOrderSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const query = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
    void api<AdminOrderSummary[]>(`/admin/orders?${query}`).then((r) => {
      setOrders(r.data);
      setError(r.error ? (r.error.message ?? 'Could not load orders.') : null);
    });
  }, [filters]);

  const set = (key: keyof typeof filters) => (e: { target: { value: string } }) => setFilters((f) => ({ ...f, [key]: e.target.value }));
  return (
    <>
      <h1>Orders</h1>
      <p>
        <label>
          Status{' '}
          <select value={filters.status} onChange={set('status')}>
            <option value="">All</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>{' '}
        <label>
          From <input type="date" value={filters.from} onChange={set('from')} />
        </label>{' '}
        <label>
          To <input type="date" value={filters.to} onChange={set('to')} />
        </label>
      </p>
      {error && <p role="alert">{error}</p>}
      {orders && orders.length === 0 && <p>No orders match.</p>}
      {orders && orders.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Placed</th>
              <th>Customer</th>
              <th>Status</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>
                  <Link href={`/admin/orders/${o.id}`}>{o.number}</Link>
                </td>
                <td>{new Date(o.createdAt).toLocaleString('id-ID')}</td>
                <td>
                  {o.customer.name} ({o.customer.email})
                </td>
                <td>{o.status}</td>
                <td>{formatIdr(o.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

export default function AdminOrdersPage() {
  return (
    <AdminOnly>
      <Orders />
    </AdminOnly>
  );
}
