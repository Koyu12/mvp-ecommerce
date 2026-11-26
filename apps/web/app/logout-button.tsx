'use client';

import { authClient } from '../lib/auth-client';

// Shown only while logged in; Better Auth deletes the session and clears the cookie.
export function LogoutButton() {
  const session = authClient.useSession();
  if (!session.data) return null;
  return (
    <>
      {' · '}
      <button type="button" onClick={() => authClient.signOut()}>
        Log out
      </button>
    </>
  );
}
