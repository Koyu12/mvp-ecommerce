'use client';

import { useCallback, useEffect, useState } from 'react';
import { authClient } from '../../../lib/auth-client';

type User = { id: string; name: string; email: string; role?: string | null };

export default function AdminUsersPage() {
  const session = authClient.useSession();
  const isAdmin = session.data?.user.role === 'admin';
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    // shortcut: first 100 users only; add paging when the Store has more.
    const result = await authClient.admin.listUsers({ query: { limit: 100, sortBy: 'createdAt' } });
    if (result.error) setError(result.error.message ?? 'Could not load users.');
    else setUsers(result.data.users);
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  const promote = async (user: User) => {
    if (!confirm(`Make ${user.email} an Admin? From then on they can only sign in with Google.`)) return;
    const result = await authClient.admin.setRole({ userId: user.id, role: 'admin' });
    if (result.error) setError(result.error.message ?? 'Could not promote the user.');
    else await load();
  };

  if (session.isPending) return <main />;
  // The API refuses /admin/* to everyone else; this only keeps the page out of sight.
  if (!isAdmin) {
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
                {user.role !== 'admin' && (
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
