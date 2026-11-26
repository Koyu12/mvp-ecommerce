'use client';

import { MAX_CART_QUANTITY, stockState, type StorefrontProduct, type StorefrontVariant } from '@mvp/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { authClient } from '../../../lib/auth-client';
import { useSubmit } from '../../../lib/use-submit';
import { formatIdr } from '../../../lib/format';

const stockLabel = ({ stock }: StorefrontVariant) =>
  ({ in_stock: 'In stock', low_stock: `Only ${stock} left`, out_of_stock: 'Out of stock' })[stockState(stock)];

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
  return <AddToCartForm variant={variant} />;
}

function AddToCartForm({ variant }: { variant: StorefrontVariant | undefined }) {
  const [added, setAdded] = useState(false);
  const { onSubmit, error, pending } = useSubmit(async (form) => {
    setAdded(false);
    const result = await api('/cart/items', 'POST', { variantId: variant?.id, quantity: Number(form.get('quantity')) });
    setAdded(!result.error);
    return result;
  });
  return (
    <form onSubmit={onSubmit}>
      <label>
        Quantity <input name="quantity" type="number" min={1} max={MAX_CART_QUANTITY} defaultValue={1} required />
      </label>{' '}
      <button disabled={pending || !variant || variant.stock === 0}>Add to cart</button>
      {added && (
        <p role="status">
          Added. <Link href="/cart">View cart</Link>
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </form>
  );
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
      {/* The picked Variant's own image leads when it has one. */}
      {[...new Set([variant?.image, ...product.images].filter((url): url is string => !!url))].map((url, i) => (
        <img key={url} src={url} alt={`${product.name}, image ${i + 1}`} width={i === 0 ? 400 : 100} />
      ))}
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
          <strong>{formatIdr(variant.effectivePrice)}</strong> · <span aria-live="polite">{stockLabel(variant)}</span>
        </p>
      ) : (
        <p aria-live="polite">This combination is not available.</p>
      )}
      <AddToCart variant={variant} />
    </main>
  );
}
