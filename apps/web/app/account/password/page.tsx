'use client';

import Link from 'next/link';
import { useState } from 'react';
import { authClient } from '../../../lib/auth-client';
import { useSubmit } from '../../../lib/use-submit';

export default function ChangePasswordPage() {
  const session = authClient.useSession();
  const [done, setDone] = useState(false);
  const { onSubmit, error, pending } = useSubmit(async (form) => {
    const result = await authClient.changePassword({
      currentPassword: String(form.get('current')),
      newPassword: String(form.get('password')),
      revokeOtherSessions: true,
    });
    setDone(!result.error);
    return result;
  });

  if (session.isPending) return <main />;
  if (!session.data) {
    return (
      <main>
        <h1>Change password</h1>
        <p>
          <Link href="/login">Log in</Link> to change your password.
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>Change password</h1>
      {done && <p role="status">Password changed. Your other devices were logged out.</p>}
      <form onSubmit={onSubmit}>
        <label>
          Current password <input name="current" type="password" autoComplete="current-password" required />
        </label>
        <label>
          New password <input name="password" type="password" autoComplete="new-password" minLength={8} required />
        </label>
        {error && <p role="alert">{error}</p>}
        <button disabled={pending}>Change password</button>
      </form>
    </main>
  );
}
