'use client';

import { isAdmin } from '@mvp/shared';
import type { ReactNode } from 'react';
import { authClient } from '../../lib/auth-client';

// The API refuses /admin/* to everyone else; this only keeps Admin pages out of sight.
export function AdminOnly({ children }: { children: ReactNode }) {
  const session = authClient.useSession();
  if (session.isPending) return <main />;
  if (!isAdmin(session.data?.user)) {
    return (
      <main>
        <h1>Page not found</h1>
      </main>
    );
  }
  return <main>{children}</main>;
}
