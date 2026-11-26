'use client';

import { type FormEvent, useState } from 'react';

type Result = { error: { message?: string; status: number } | null };

// Runs a Better Auth call from a form and tracks its pending and error state.
export function useSubmit(action: (form: FormData) => Promise<Result | void>) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await action(new FormData(event.currentTarget));
      if (result?.error) {
        setError(
          result.error.status === 429
            ? 'Too many attempts. Wait a minute and try again.'
            : (result.error.message ?? 'Something went wrong.'),
        );
      }
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setPending(false);
    }
  };

  return { onSubmit, error, pending };
}
