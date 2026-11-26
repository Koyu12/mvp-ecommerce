'use client';

import type { AdminProduct, Category, OptionType, ProductInput } from '@mvp/shared';
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { useSubmit } from '../../../lib/use-submit';

// The Categories and Option types a Product form picks from.
export function useCatalogChoices() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [types, setTypes] = useState<OptionType[]>([]);
  useEffect(() => {
    void api<Category[]>('/admin/categories').then((r) => setCategories(r.data ?? []));
    void api<OptionType[]>('/admin/option-types').then((r) => setTypes(r.data ?? []));
  }, []);
  return { categories, types };
}

// Creates a Product, or edits `product` when given. Option types are fixed once it has Variants.
export function ProductForm({ product, onSaved }: { product?: AdminProduct; onSaved: (p: AdminProduct) => void }) {
  const { categories, types } = useCatalogChoices();
  const locked = !!product?.variants.length;
  const { onSubmit, error, pending } = useSubmit(async (form) => {
    const body: ProductInput & { archived?: boolean } = {
      name: String(form.get('name')),
      description: String(form.get('description')),
      categoryId: String(form.get('categoryId')),
      price: Number(form.get('price')),
      optionTypeIds: form.getAll('optionTypeIds').map(String),
    };
    if (product) body.archived = form.get('archived') === 'on';
    const result = product
      ? await api<AdminProduct>(`/admin/products/${product.id}`, 'PATCH', locked ? { ...body, optionTypeIds: undefined } : body)
      : await api<AdminProduct>('/admin/products', 'POST', body);
    if (result.data) onSaved(result.data);
    return result;
  });

  if (!categories.length) return <p>Add a Category first.</p>;
  return (
    <form onSubmit={onSubmit}>
      <label>
        Name <input name="name" defaultValue={product?.name} required maxLength={200} />
      </label>
      <label>
        Description <textarea name="description" defaultValue={product?.description} maxLength={5000} />
      </label>
      <label>
        Category{' '}
        <select name="categoryId" defaultValue={product?.categoryId} required>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Price (IDR) <input name="price" type="number" min={0} step={1} defaultValue={product?.price} required />
      </label>
      <fieldset disabled={locked}>
        <legend>Option types{locked && ' (fixed once the Product has Variants)'}</legend>
        {types.map((t) => (
          <label key={t.id}>
            <input type="checkbox" name="optionTypeIds" value={t.id} defaultChecked={product?.optionTypeIds.includes(t.id)} />{' '}
            {t.name}
          </label>
        ))}
      </fieldset>
      {product && (
        <label>
          <input type="checkbox" name="archived" defaultChecked={product.archived} /> Archived (hidden from the store)
        </label>
      )}
      {error && <p role="alert">{error}</p>}
      <button disabled={pending}>{product ? 'Save Product' : 'Create Product'}</button>
    </form>
  );
}
