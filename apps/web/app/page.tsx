import Link from 'next/link';
import { ApiStatus } from './api-status';

export default function Home() {
  return (
    <main>
      <h1>MVP Store</h1>
      <ApiStatus />
      <nav>
        <Link href="/signup">Sign up</Link> · <Link href="/login">Log in</Link> ·{' '}
        <Link href="/account/password">Change password</Link>
      </nav>
    </main>
  );
}
