'use client';

import Link from 'next/link';
import { authClient } from '../lib/auth-client';

// Shown to Admins only, so Customers and Guests see no way into the Admin pages.
export function AdminLink() {
  const session = authClient.useSession();
  if (session.data?.user.role !== 'admin') return null;
  return (
    <>
      {' · '}
      <Link href="/admin/users">Users</Link>
    </>
  );
}
