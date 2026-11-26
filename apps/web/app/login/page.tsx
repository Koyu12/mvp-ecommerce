'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { authClient } from '../../lib/auth-client';
import { useSubmit } from '../../lib/use-submit';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { onSubmit, error, pending } = useSubmit(async (form) => {
    const email = String(form.get('email'));
    const result = await authClient.signIn.email({ email, password: String(form.get('password')) });
    // 403 means the email is not verified yet.
    if (result.error?.status === 403) return router.push(`/verify?email=${encodeURIComponent(email)}`);
    if (!result.error) router.push('/');
    return result;
  });

  return (
    <main>
      <h1>Log in</h1>
      {params.get('verified') && !params.get('error') && <p role="status">Email verified. You can log in now.</p>}
      {params.get('error') && (
        <p role="alert">That verification link is invalid or has expired. Log in to get a new one.</p>
      )}
      <form onSubmit={onSubmit}>
        <label>
          Email <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Password <input name="password" type="password" autoComplete="current-password" required />
        </label>
        {error && <p role="alert">{error}</p>}
        <button disabled={pending}>Log in</button>
      </form>
      <p>
        <Link href="/forgot-password">Forgot your password?</Link> · <Link href="/signup">Create an account</Link>
      </p>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
