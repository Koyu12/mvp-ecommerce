'use client';

import type { StorefrontProduct, StorefrontVariant } from '@mvp/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { authClient } from '../../../lib/auth-client';
import { formatIdr } from '../../admin/admin-only';

const stockState = (variant: StorefrontVariant) =>
  variant.stock === 0 ? 'Out of stock' : variant.stock <= 5 ? `Only ${variant.stock} left` : 'In stock';

function AddToCart({ variant }: { variant: StorefrontVariant | undefined }) {
  const session = authClient.useSession();
  if (session.isPending) return null;
  if (!session.data) {
    return (
      <p>
        <Link href="/login">Log in to add to cart</Link>
      </p>
    );
  }
  // shortcut: the Cart arrives in #10, which wires this button up.
  return <button disabled={!variant || variant.stock === 0}>Add to cart</button>;
}

export default function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<StorefrontProduct | null>(null);
  const [missing, setMissing] = useState(false);
  // The picked Option value id per Option type id.
  const [picked, setPicked] = useState<Record<string, string>>({});

  useEffect(() => {
    void api<StorefrontProduct>(`/products/${id}`).then((r) => {
      setProduct(r.data);
      setMissing(!!r.error);
      // Start on the first Variant, so a single-Variant Product needs no picking.
      const first = r.data?.variants[0];
      if (r.data && first) {
        setPicked(
          Object.fromEntries(r.data.optionTypes.map((t) => [t.id, t.values.find((v) => first.optionValueIds.includes(v.id))?.id ?? ''])),
        );
      }
    });
  }, [id]);

  if (missing) {
    return (
      <main>
        <h1>Product not found</h1>
        <Link href="/products">Browse Products</Link>
      </main>
    );
  }
  if (!product) return <main />;

  const pickedIds = Object.values(picked).sort().join();
  const variant = product.variants.find((v) => v.optionValueIds.join() === pickedIds);

  return (
    <main>
      <p>
        <Link href={`/products?categoryId=${product.category.id}`}>{product.category.name}</Link>
      </p>
      <h1>{product.name}</h1>
      <p>{product.description}</p>
      {product.optionTypes.map((t) => (
        <label key={t.id}>
          {t.name}{' '}
          <select value={picked[t.id] ?? ''} onChange={(e) => setPicked({ ...picked, [t.id]: e.target.value })}>
            {t.values.map((v) => (
              <option key={v.id} value={v.id}>
                {v.value}
              </option>
            ))}
          </select>{' '}
        </label>
      ))}
      {variant ? (
        <p>
          <strong>{formatIdr(variant.effectivePrice)}</strong> · <span aria-live="polite">{stockState(variant)}</span>
        </p>
      ) : (
        <p aria-live="polite">This combination is not available.</p>
      )}
      <AddToCart variant={variant} />
    </main>
  );
}
