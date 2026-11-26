import Link from 'next/link';
import { AdminLink } from './admin-link';
import { ApiStatus } from './api-status';
import { LogoutButton } from './logout-button';

export default function Home() {
  return (
    <main>
      <h1>MVP Store</h1>
      <ApiStatus />
      <nav>
        <Link href="/products">Shop</Link> · <Link href="/signup">Sign up</Link> · <Link href="/login">Log in</Link> ·{' '}
        <Link href="/account">My account</Link> · <Link href="/account/password">Change password</Link>
        <AdminLink />
        <LogoutButton />
      </nav>
    </main>
  );
}
