'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { authClient } from '../../lib/auth-client';
import { useSubmit } from '../../lib/use-submit';

function Verify() {
  const email = useSearchParams().get('email') ?? '';
  const [sent, setSent] = useState(false);
  const { onSubmit, error, pending } = useSubmit(async (form) => {
    const result = await authClient.sendVerificationEmail({
      email: String(form.get('email')),
      callbackURL: '/login?verified=1',
    });
    setSent(!result.error);
    return result;
  });

  return (
    <main>
      <h1>Verify your email</h1>
      <p>We sent a verification link to your email. Open it to activate your account, then log in.</p>
      <form onSubmit={onSubmit}>
        <label>
          Email <input name="email" type="email" defaultValue={email} autoComplete="email" required />
        </label>
        {error && <p role="alert">{error}</p>}
        {sent && <p role="status">Sent. Check your inbox.</p>}
        <button disabled={pending}>Resend verification email</button>
      </form>
    </main>
  );
}

export default function VerifyPage() {
  return (
    <Suspense>
      <Verify />
    </Suspense>
  );
}
