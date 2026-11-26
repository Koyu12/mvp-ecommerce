'use client';

import { isAdmin } from '@mvp/shared';
import Link from 'next/link';
import { authClient } from '../lib/auth-client';

// Shown to Admins only, so Customers and Guests see no way into the Admin pages.
export function AdminLink() {
  const session = authClient.useSession();
  if (!isAdmin(session.data?.user)) return null;
  return (
    <>
      {' · '}
      <Link href="/admin/users">Users</Link>
    </>
  );
}
