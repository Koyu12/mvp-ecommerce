'use client';

import type { Category, OptionType } from '@mvp/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../../lib/api';
import { useSubmit } from '../../../lib/use-submit';
import { AdminOnly } from '../admin-only';

type Result = Awaited<ReturnType<typeof api>>;

// One-field "add" form that clears itself after a successful submit.
function AddForm({ label, field, onAdd }: { label: string; field: string; onAdd: (value: string) => Promise<Result> }) {
  const ref = useRef<HTMLFormElement>(null);
  const { onSubmit, error, pending } = useSubmit(async (form) => {
    const result = await onAdd(String(form.get(field) ?? ''));
    if (!result.error) ref.current?.reset();
    return result;
  });
  return (
    <form ref={ref} onSubmit={onSubmit}>
      <label>
        {label} <input name={field} required maxLength={100} />
      </label>
      <button disabled={pending}>Add</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

export default function AdminCatalogPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [types, setTypes] = useState<OptionType[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    void api<Category[]>('/admin/categories').then((r) => setCategories(r.data ?? []));
    void api<OptionType[]>('/admin/option-types').then((r) => setTypes(r.data ?? []));
  }, []);
  useEffect(reload, [reload]);

  // Runs an edit, shows its error if any, and reloads the lists.
  const run = async (call: Promise<Result>) => {
    const result = await call;
    setError(result.error ? (result.error.message ?? 'Something went wrong.') : null);
    reload();
    return result;
  };
  const rename = (path: string, field: string, current: string) => {
    const next = prompt('New name', current);
    if (next && next !== current) void run(api(path, 'PATCH', { [field]: next }));
  };

  return (
    <AdminOnly>
      <h1>Categories and options</h1>
      {error && <p role="alert">{error}</p>}

      <section>
        <h2>Categories</h2>
        <ul>
          {categories.map((c) => (
            <li key={c.id}>
              {c.name} <button onClick={() => rename(`/admin/categories/${c.id}`, 'name', c.name)}>Rename</button>{' '}
              <button onClick={() => void run(api(`/admin/categories/${c.id}`, 'DELETE'))}>Delete</button>
            </li>
          ))}
        </ul>
        <AddForm label="New Category" field="name" onAdd={(name) => run(api('/admin/categories', 'POST', { name }))} />
      </section>

      <section>
        <h2>Option types</h2>
        {types.map((t) => (
          <div key={t.id}>
            <h3>
              {t.name} <button onClick={() => rename(`/admin/option-types/${t.id}`, 'name', t.name)}>Rename</button>{' '}
              <button onClick={() => void run(api(`/admin/option-types/${t.id}`, 'DELETE'))}>Delete</button>
            </h3>
            <ul>
              {t.values.map((v) => (
                <li key={v.id}>
                  {v.value} <button onClick={() => rename(`/admin/option-values/${v.id}`, 'value', v.value)}>Rename</button>{' '}
                  <button onClick={() => void run(api(`/admin/option-values/${v.id}`, 'DELETE'))}>Delete</button>
                </li>
              ))}
            </ul>
            <AddForm
              label={`New ${t.name} value`}
              field="value"
              onAdd={(value) => run(api(`/admin/option-types/${t.id}/values`, 'POST', { value }))}
            />
          </div>
        ))}
        <AddForm label="New Option type" field="name" onAdd={(name) => run(api('/admin/option-types', 'POST', { name }))} />
      </section>
    </AdminOnly>
  );
}
