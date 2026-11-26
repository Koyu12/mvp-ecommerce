'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { authClient } from '../../lib/auth-client';
import { useSubmit } from '../../lib/use-submit';

function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get('token');
  const { onSubmit, error, pending } = useSubmit(async (form) => {
    const result = await authClient.resetPassword({ token: token!, newPassword: String(form.get('password')) });
    if (!result.error) router.push('/login');
    return result;
  });

  // The API redirects here with ?error=INVALID_TOKEN instead of a token when the link is bad.
  if (!token) {
    return (
      <main>
        <h1>Reset your password</h1>
        <p role="alert">
          That reset link is invalid or has expired. <Link href="/forgot-password">Request a new one</Link>.
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>Choose a new password</h1>
      <form onSubmit={onSubmit}>
        <label>
          New password <input name="password" type="password" autoComplete="new-password" minLength={8} required />
        </label>
        {error && <p role="alert">{error}</p>}
        <button disabled={pending}>Set password</button>
      </form>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
