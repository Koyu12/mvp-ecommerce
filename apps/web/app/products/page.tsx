'use client';

import type { Category, OptionType, ProductPage } from '@mvp/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, Suspense, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { formatIdr } from '../admin/admin-only';

// Category pages, search and filters are one listing driven by the URL, so every result page can be linked to.
function Listing() {
  const router = useRouter();
  const params = useSearchParams();
  const [categories, setCategories] = useState<Category[]>([]);
  const [types, setTypes] = useState<OptionType[]>([]);
  const [page, setPage] = useState<ProductPage | null>(null);
  const [failed, setFailed] = useState(false);
  const query = params.toString();
  const picked = (params.get('optionValueIds') ?? '').split(',');
  const categoryId = params.get('categoryId') ?? '';

  useEffect(() => {
    void api<Category[]>('/categories').then((r) => setCategories(r.data ?? []));
    void api<OptionType[]>('/option-types').then((r) => setTypes(r.data ?? []));
  }, []);
  useEffect(() => {
    void api<ProductPage>(`/products?${query}`).then((r) => {
      setPage(r.data);
      setFailed(!!r.error);
    });
  }, [query]);

  const go = (next: URLSearchParams) => router.push(`/products?${next.toString()}`);
  const onSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    for (const key of ['categoryId', 'q', 'minPrice', 'maxPrice']) {
      const value = String(form.get(key) ?? '').trim();
      if (value) next.set(key, value);
    }
    const values = form.getAll('optionValueIds').map(String);
    if (values.length) next.set('optionValueIds', values.join(','));
    go(next);
  };
  const toPage = (n: number) => {
    const next = new URLSearchParams(params);
    next.set('page', String(n));
    go(next);
  };
  const category = categories.find((c) => c.id === categoryId);
  const pages = page ? Math.max(1, Math.ceil(page.total / page.pageSize)) : 1;

  return (
    <main>
      <p>
        <Link href="/">Home</Link>
      </p>
      <h1>{category?.name ?? 'All Products'}</h1>
      <nav aria-label="Categories">
        <Link href="/products">All</Link>
        {categories.map((c) => (
          <span key={c.id}>
            {' · '}
            <Link href={`/products?categoryId=${c.id}`} aria-current={c.id === categoryId ? 'page' : undefined}>
              {c.name}
            </Link>
          </span>
        ))}
      </nav>
      {/* key resets the fields when the URL changes, for example on a Category link */}
      <form key={query} onSubmit={onSearch} role="search">
        <input type="hidden" name="categoryId" value={categoryId} />
        <label>
          Search <input name="q" type="search" defaultValue={params.get('q') ?? ''} maxLength={100} />
        </label>{' '}
        <label>
          Min price (IDR) <input name="minPrice" type="number" min={0} step={1} defaultValue={params.get('minPrice') ?? ''} />
        </label>{' '}
        <label>
          Max price (IDR) <input name="maxPrice" type="number" min={0} step={1} defaultValue={params.get('maxPrice') ?? ''} />
        </label>
        {types.map((t) => (
          <fieldset key={t.id}>
            <legend>{t.name}</legend>
            {t.values.map((v) => (
              <label key={v.id}>
                <input type="checkbox" name="optionValueIds" value={v.id} defaultChecked={picked.includes(v.id)} /> {v.value}{' '}
              </label>
            ))}
          </fieldset>
        ))}
        <button>Apply</button>
      </form>
      {failed && <p role="alert">Could not load Products. Check the filters and try again.</p>}
      {page && !page.items.length && <p>No Products match.</p>}
      {page && page.items.length > 0 && (
        <>
          <ul>
            {page.items.map((p) => (
              <li key={p.id}>
                {p.image && <img src={p.image} alt="" width={80} />}{' '}
                <Link href={`/products/${p.id}`}>{p.name}</Link> from {formatIdr(p.fromPrice)}
                {!p.inStock && ' (out of stock)'}
              </li>
            ))}
          </ul>
          <p>
            <button disabled={page.page <= 1} onClick={() => toPage(page.page - 1)}>
              Previous
            </button>{' '}
            Page {page.page} of {pages}{' '}
            <button disabled={page.page >= pages} onClick={() => toPage(page.page + 1)}>
              Next
            </button>
          </p>
        </>
      )}
    </main>
  );
}

export default function ProductsPage() {
  // useSearchParams needs a Suspense boundary for the static build.
  return (
    <Suspense fallback={<main />}>
      <Listing />
    </Suspense>
  );
}
