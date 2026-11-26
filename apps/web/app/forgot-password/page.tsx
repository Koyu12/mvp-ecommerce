'use client';

import { useState } from 'react';
import { authClient } from '../../lib/auth-client';
import { useSubmit } from '../../lib/use-submit';

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const { onSubmit, error, pending } = useSubmit(async (form) => {
    const result = await authClient.requestPasswordReset({
      email: String(form.get('email')),
      redirectTo: '/reset-password',
    });
    setSent(!result.error);
    return result;
  });

  return (
    <main>
      <h1>Reset your password</h1>
      {sent ? (
        <p role="status">If an account uses that email, we sent it a reset link.</p>
      ) : (
        <form onSubmit={onSubmit}>
          <label>
            Email <input name="email" type="email" autoComplete="email" required />
          </label>
          {error && <p role="alert">{error}</p>}
          <button disabled={pending}>Send reset link</button>
        </form>
      )}
    </main>
  );
}
