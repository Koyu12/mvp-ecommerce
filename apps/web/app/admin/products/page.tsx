'use client';

import type { AdminProduct } from '@mvp/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { AdminOnly, formatIdr } from '../admin-only';
import { ProductForm } from './product-form';

function ProductList() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  useEffect(() => {
    void api<AdminProduct[]>('/admin/products').then((r) => setProducts(r.data ?? []));
  }, []);
  if (!products.length) return <p>No Products yet.</p>;
  return (
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Price</th>
          <th>Variants</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {products.map((p) => (
          <tr key={p.id}>
            <td>
              {p.images[0] && <img src={p.images[0]} alt="" width={40} />}{' '}
              <Link href={`/admin/products/${p.id}`}>{p.name}</Link>
            </td>
            <td>{formatIdr(p.price)}</td>
            <td>{p.variants.length}</td>
            <td>{p.archived ? 'Archived' : 'On sale'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function AdminProductsPage() {
  const router = useRouter();
  return (
    <AdminOnly>
      <h1>Products</h1>
      <ProductList />
      <h2>New Product</h2>
      <ProductForm onSaved={(p) => router.push(`/admin/products/${p.id}`)} />
    </AdminOnly>
  );
}
