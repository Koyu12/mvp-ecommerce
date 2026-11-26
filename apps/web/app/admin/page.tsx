'use client';

import type { LowStockVariant } from '@mvp/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { AdminOnly, formatIdr } from './admin-only';

function LowStock() {
  const [variants, setVariants] = useState<LowStockVariant[] | null>(null);
  useEffect(() => {
    void api<LowStockVariant[]>('/admin/variants/low-stock').then((r) => setVariants(r.data ?? []));
  }, []);
  if (!variants) return null;
  return (
    <section>
      <h2>Low Stock (below 5)</h2>
      {variants.length === 0 ? (
        <p>Every Variant on sale has at least 5 in Stock.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>SKU</th>
              <th>Stock</th>
              <th>Price</th>
            </tr>
          </thead>
          <tbody>
            {variants.map((v) => (
              <tr key={v.id}>
                <td>
                  <Link href={`/admin/products/${v.productId}`}>{v.productName}</Link>
                </td>
                <td>{v.sku}</td>
                <td>{v.stock}</td>
                <td>{formatIdr(v.effectivePrice)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default function AdminDashboardPage() {
  return (
    <AdminOnly>
      <h1>Dashboard</h1>
      <nav>
        <Link href="/admin/products">Products</Link> · <Link href="/admin/catalog">Categories and options</Link> ·{' '}
        <Link href="/admin/users">Users</Link> · <Link href="/admin/settings">Settings</Link>
      </nav>
      <LowStock />
    </AdminOnly>
  );
}
