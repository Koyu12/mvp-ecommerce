'use client';

import type { Address, AddressInput, Profile } from '@mvp/shared';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { authClient } from '../../lib/auth-client';
import { useSubmit } from '../../lib/use-submit';

const FIELDS: [keyof AddressInput, string, boolean][] = [
  ['recipientName', 'Recipient name', true],
  ['phone', 'Phone', true],
  ['line1', 'Address line 1', true],
  ['line2', 'Address line 2', false],
  ['city', 'City', true],
  ['region', 'Province', true],
  ['postalCode', 'Postal code', true],
];

const formToAddress = (form: FormData) =>
  Object.fromEntries(FIELDS.map(([name]) => [name, String(form.get(name) ?? '')])) as AddressInput;

function ProfileForm() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    void api<Profile>('/profile').then((r) => setProfile(r.data));
  }, []);
  const { onSubmit, error, pending } = useSubmit(async (form) => {
    const result = await api<Profile>('/profile', 'PATCH', { name: form.get('name'), phone: form.get('phone') });
    setSaved(!result.error);
    if (result.data) setProfile(result.data);
    return result;
  });

  if (!profile) return null;
  return (
    <section>
      <h2>Profile</h2>
      <p>Email: {profile.email}</p>
      {saved && <p role="status">Profile saved.</p>}
      <form onSubmit={onSubmit}>
        <label>
          Name <input name="name" defaultValue={profile.name} autoComplete="name" required maxLength={100} />
        </label>
        <label>
          Phone <input name="phone" type="tel" defaultValue={profile.phone ?? ''} autoComplete="tel" maxLength={30} />
        </label>
        {error && <p role="alert">{error}</p>}
        <button disabled={pending}>Save profile</button>
      </form>
    </section>
  );
}

function AddressForm({ address, onDone }: { address?: Address; onDone: () => void }) {
  const { onSubmit, error, pending } = useSubmit(async (form) => {
    const body = formToAddress(form);
    const result = address ? await api(`/addresses/${address.id}`, 'PATCH', body) : await api('/addresses', 'POST', body);
    if (!result.error) onDone();
    return result;
  });
  return (
    <form onSubmit={onSubmit}>
      {FIELDS.map(([name, label, required]) => (
        <label key={name}>
          {label} <input name={name} defaultValue={address?.[name] ?? ''} required={required} />
        </label>
      ))}
      {error && <p role="alert">{error}</p>}
      <button disabled={pending}>{address ? 'Save address' : 'Add address'}</button>
    </form>
  );
}

function AddressBook() {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    setEditing(null);
    void api<Address[]>('/addresses').then((r) => setAddresses(r.data ?? []));
  }, []);
  useEffect(reload, [reload]);

  const remove = async (id: string) => {
    const result = await api(`/addresses/${id}`, 'DELETE');
    setError(result.error ? 'Could not delete the address.' : null);
    reload();
  };

  return (
    <section>
      <h2>Address book</h2>
      {error && <p role="alert">{error}</p>}
      {addresses.length === 0 && <p>No saved addresses yet.</p>}
      <ul>
        {addresses.map((a) => (
          <li key={a.id}>
            {editing === a.id ? (
              <AddressForm address={a} onDone={reload} />
            ) : (
              <>
                <address>
                  {a.recipientName}, {a.phone}
                  <br />
                  {a.line1}
                  {a.line2 && `, ${a.line2}`}, {a.city}, {a.region} {a.postalCode}
                </address>
                <button onClick={() => setEditing(a.id)}>Edit</button>{' '}
                <button onClick={() => void remove(a.id)}>Delete</button>
              </>
            )}
          </li>
        ))}
      </ul>
      <h3>Add an address</h3>
      {/* key remounts the form so it clears after each add */}
      <AddressForm key={addresses.length} onDone={reload} />
    </section>
  );
}

export default function AccountPage() {
  const session = authClient.useSession();

  if (session.isPending) return <main />;
  if (!session.data) {
    return (
      <main>
        <h1>My account</h1>
        <p>
          <Link href="/login">Log in</Link> to manage your profile and addresses.
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>My account</h1>
      <ProfileForm />
      <AddressBook />
      <p>
        <Link href="/account/password">Change password</Link>
      </p>
    </main>
  );
}
