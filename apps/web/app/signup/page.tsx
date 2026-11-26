'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authClient } from '../../lib/auth-client';
import { useSubmit } from '../../lib/use-submit';

export default function SignupPage() {
  const router = useRouter();
  const { onSubmit, error, pending } = useSubmit(async (form) => {
    const email = String(form.get('email'));
    const result = await authClient.signUp.email({
      name: String(form.get('name')),
      email,
      password: String(form.get('password')),
      callbackURL: '/login?verified=1',
    });
    if (!result.error) router.push(`/verify?email=${encodeURIComponent(email)}`);
    return result;
  });

  return (
    <main>
      <h1>Create an account</h1>
      <form onSubmit={onSubmit}>
        <label>
          Name <input name="name" autoComplete="name" required />
        </label>
        <label>
          Email <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Password <input name="password" type="password" autoComplete="new-password" minLength={8} required />
        </label>
        {error && <p role="alert">{error}</p>}
        <button disabled={pending}>Sign up</button>
      </form>
      <p>
        Already have an account? <Link href="/login">Log in</Link>
      </p>
    </main>
  );
}
