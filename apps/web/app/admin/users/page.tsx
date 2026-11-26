'use client';

import { ADMIN, isAdmin } from '@mvp/shared';
import type { UserWithRole } from 'better-auth/plugins/admin';
import { useCallback, useEffect, useState } from 'react';
import { authClient } from '../../../lib/auth-client';

export default function AdminUsersPage() {
  const session = authClient.useSession();
  const signedInAsAdmin = isAdmin(session.data?.user);
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    // shortcut: first 100 users only; add paging when the Store has more.
    const result = await authClient.admin.listUsers({ query: { limit: 100, sortBy: 'createdAt' } });
    if (result.error) setError(result.error.message ?? 'Could not load users.');
    else setUsers(result.data.users);
  }, []);

  useEffect(() => {
    if (signedInAsAdmin) void load();
  }, [signedInAsAdmin, load]);

  const promote = async (user: UserWithRole) => {
    if (!confirm(`Make ${user.email} an Admin? From then on they can only sign in with Google.`)) return;
    const result = await authClient.admin.setRole({ userId: user.id, role: ADMIN });
    if (result.error) setError(result.error.message ?? 'Could not promote the user.');
    else await load();
  };

  if (session.isPending) return <main />;
  // The API refuses /admin/* to everyone else; this only keeps the page out of sight.
  if (!signedInAsAdmin) {
    return (
      <main>
        <h1>Page not found</h1>
      </main>
    );
  }

  return (
    <main>
      <h1>Users</h1>
      {error && <p role="alert">{error}</p>}
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>
              <span hidden>Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td>{user.name}</td>
              <td>{user.email}</td>
              <td>{user.role}</td>
              <td>
                {!isAdmin(user) && (
                  <button type="button" onClick={() => promote(user)}>
                    Make Admin
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
