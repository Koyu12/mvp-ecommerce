'use client';

import type { AdminProduct, AdminVariant, OptionType, VariantInput } from '@mvp/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../../lib/api';
import { useSubmit } from '../../../../lib/use-submit';
import { AdminOnly, formatIdr } from '../../admin-only';
import { ProductForm, useCatalogChoices } from '../product-form';

// A blank price field means "use the Product price".
const priceField = (form: FormData) => (form.get('price') === '' ? null : Number(form.get('price')));

function VariantRow({ variant, labels, onSaved }: { variant: AdminVariant; labels: string; onSaved: () => void }) {
  const { onSubmit, error, pending } = useSubmit(async (form) => {
    const result = await api(`/admin/variants/${variant.id}`, 'PATCH', {
      sku: String(form.get('sku')),
      stock: Number(form.get('stock')),
      price: priceField(form),
      archived: form.get('archived') === 'on',
    });
    if (!result.error) onSaved();
    return result;
  });
  return (
    <li>
      <form onSubmit={onSubmit}>
        <strong>{labels || 'Default'}</strong>{' '}
        <label>
          SKU <input name="sku" defaultValue={variant.sku} required maxLength={64} />
        </label>{' '}
        <label>
          Stock <input name="stock" type="number" min={0} step={1} defaultValue={variant.stock} required />
        </label>{' '}
        <label>
          Own price (IDR) <input name="price" type="number" min={0} step={1} defaultValue={variant.price ?? ''} />
        </label>{' '}
        <label>
          <input type="checkbox" name="archived" defaultChecked={variant.archived} /> Archived
        </label>{' '}
        Sells for {formatIdr(variant.effectivePrice)} <button disabled={pending}>Save</button>
        {error && <p role="alert">{error}</p>}
      </form>
    </li>
  );
}

function AddVariant({ product, types, onSaved }: { product: AdminProduct; types: OptionType[]; onSaved: () => void }) {
  const used = types.filter((t) => product.optionTypeIds.includes(t.id));
  const { onSubmit, error, pending } = useSubmit(async (form) => {
    const body: VariantInput = {
      sku: String(form.get('sku')),
      stock: Number(form.get('stock')),
      price: priceField(form),
      optionValueIds: used.map((t) => String(form.get(t.id))),
    };
    const result = await api(`/admin/products/${product.id}/variants`, 'POST', body);
    if (!result.error) onSaved();
    return result;
  });
  return (
    <form onSubmit={onSubmit}>
      {used.map((t) => (
        <label key={t.id}>
          {t.name}{' '}
          <select name={t.id} required>
            {t.values.map((v) => (
              <option key={v.id} value={v.id}>
                {v.value}
              </option>
            ))}
          </select>{' '}
        </label>
      ))}
      <label>
        SKU <input name="sku" required maxLength={64} />
      </label>{' '}
      <label>
        Stock <input name="stock" type="number" min={0} step={1} defaultValue={0} required />
      </label>{' '}
      <label>
        Own price (IDR, optional) <input name="price" type="number" min={0} step={1} />
      </label>{' '}
      <button disabled={pending}>Add Variant</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

export default function AdminProductPage() {
  const { id } = useParams<{ id: string }>();
  const { types } = useCatalogChoices();
  const [product, setProduct] = useState<AdminProduct | null>(null);
  const reload = useCallback(() => {
    void api<AdminProduct>(`/admin/products/${id}`).then((r) => setProduct(r.data));
  }, [id]);
  useEffect(reload, [reload]);

  const valueName = new Map(types.flatMap((t) => t.values.map((v) => [v.id, v.value] as const)));

  return (
    <AdminOnly>
      <p>
        <Link href="/admin/products">All Products</Link>
      </p>
      {product && (
        <>
          <h1>{product.name}</h1>
          {/* key remounts the form with fresh values after each save */}
          <ProductForm key={JSON.stringify(product)} product={product} onSaved={setProduct} />
          <h2>Variants</h2>
          <ul>
            {product.variants.map((v) => (
              <VariantRow
                key={JSON.stringify(v)}
                variant={v}
                labels={v.optionValueIds.map((o) => valueName.get(o)).join(' / ')}
                onSaved={reload}
              />
            ))}
          </ul>
          <h3>Add a Variant</h3>
          <AddVariant key={product.variants.length} product={product} types={types} onSaved={reload} />
        </>
      )}
    </AdminOnly>
  );
}
