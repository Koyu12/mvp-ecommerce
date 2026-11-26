'use client';

import { type AdminProduct, type AdminVariant, IMAGE_TYPES, type OptionType, type VariantInput } from '@mvp/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { type ChangeEvent, useCallback, useEffect, useState } from 'react';
import { api } from '../../../../lib/api';
import { uploadImage } from '../../../../lib/upload';
import { useSubmit } from '../../../../lib/use-submit';
import { AdminOnly, formatIdr } from '../../admin-only';
import { ProductForm, useCatalogChoices } from '../product-form';

// A blank price field means "use the Product price".
const priceField = (form: FormData) => (form.get('price') === '' ? null : Number(form.get('price')));

const ACCEPT = Object.keys(IMAGE_TYPES).join(',');

// Uploads each picked file in turn and hands over their URLs; the input is cleared so the same file can be picked again.
function useImagePicker(onUploaded: (urls: string[]) => Promise<{ error: { message?: string } | null }>) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const onChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    setPending(true);
    setError(null);
    const urls: string[] = [];
    for (const file of files) {
      const result = await uploadImage(file);
      if (!result.url) {
        setError(result.error);
        break;
      }
      urls.push(result.url);
    }
    if (urls.length) {
      const saved = await onUploaded(urls);
      if (saved.error) setError(saved.error.message ?? 'Could not save the image.');
    }
    setPending(false);
  };
  return { onChange, error, pending };
}

// The Product's images in display order; the first is the main image. Every change saves at once.
function ProductImages({ product, onSaved }: { product: AdminProduct; onSaved: (p: AdminProduct) => void }) {
  const save = async (images: string[]) => {
    const result = await api<AdminProduct>(`/admin/products/${product.id}`, 'PATCH', { images });
    if (result.data) onSaved(result.data);
    return result;
  };
  const picker = useImagePicker((urls) => save([...product.images, ...urls]));
  const move = (i: number, by: number) => {
    const images = [...product.images];
    [images[i], images[i + by]] = [images[i + by], images[i]];
    void save(images);
  };
  return (
    <>
      <h2>Images</h2>
      <ol>
        {product.images.map((url, i) => (
          <li key={url}>
            <img src={url} alt={`${product.name}, image ${i + 1}`} width={120} />{' '}
            <button type="button" disabled={i === 0} onClick={() => move(i, -1)}>
              Move up
            </button>{' '}
            <button type="button" disabled={i === product.images.length - 1} onClick={() => move(i, 1)}>
              Move down
            </button>{' '}
            <button type="button" onClick={() => void save(product.images.filter((u) => u !== url))}>
              Remove
            </button>
          </li>
        ))}
      </ol>
      <label>
        Add images (JPEG, PNG or WebP, up to 5 MB){' '}
        <input type="file" accept={ACCEPT} multiple disabled={picker.pending} onChange={picker.onChange} />
      </label>
      {picker.error && <p role="alert">{picker.error}</p>}
    </>
  );
}

function VariantImage({ variant, onSaved }: { variant: AdminVariant; onSaved: () => void }) {
  const save = async (image: string | null) => {
    const result = await api(`/admin/variants/${variant.id}`, 'PATCH', { image });
    if (!result.error) onSaved();
    return result;
  };
  const picker = useImagePicker(([url]) => save(url));
  return (
    <span>
      {variant.image && (
        <>
          <img src={variant.image} alt={`Variant ${variant.sku}`} width={60} />{' '}
          <button type="button" onClick={() => void save(null)}>
            Remove image
          </button>{' '}
        </>
      )}
      <label>
        {variant.image ? 'Replace image' : 'Image'}{' '}
        <input type="file" accept={ACCEPT} disabled={picker.pending} onChange={picker.onChange} />
      </label>
      {picker.error && <p role="alert">{picker.error}</p>}
    </span>
  );
}

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
      <VariantImage variant={variant} onSaved={onSaved} />
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
          <ProductImages product={product} onSaved={setProduct} />
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
