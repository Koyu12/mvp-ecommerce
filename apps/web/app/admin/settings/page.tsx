'use client';

import { isAdmin, type StoreSettings } from '@mvp/shared';
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { authClient } from '../../../lib/auth-client';
import { useSubmit } from '../../../lib/use-submit';

export default function AdminSettingsPage() {
  const session = authClient.useSession();
  const signedInAsAdmin = isAdmin(session.data?.user);
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (signedInAsAdmin) void api<StoreSettings>('/admin/settings').then((r) => setSettings(r.data));
  }, [signedInAsAdmin]);

  const { onSubmit, error, pending } = useSubmit(async (form) => {
    const result = await api<StoreSettings>('/admin/settings', 'PUT', { shippingFee: Number(form.get('shippingFee')) });
    setSaved(!result.error);
    if (result.data) setSettings(result.data);
    return result;
  });

  if (session.isPending) return <main />;
  // The API refuses /admin/* to everyone else; this only keeps the page out of sight.
  if (!signedInAsAdmin) {
    return (
      <main>
        <h1>Page not found</h1>
      </main>
    );
  }
  if (!settings) return <main />;

  return (
    <main>
      <h1>Settings</h1>
      {saved && <p role="status">Settings saved.</p>}
      <form onSubmit={onSubmit}>
        <label>
          Shipping fee (IDR){' '}
          <input name="shippingFee" type="number" min={0} step={1} defaultValue={settings.shippingFee} required />
        </label>
        {error && <p role="alert">{error}</p>}
        <button disabled={pending}>Save settings</button>
      </form>
    </main>
  );
}
