import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FakeGoogle, GoogleProfile } from './fakes';
import { createTestApp, TestApp } from './test-app';

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct-horse-battery';

describe('Google sign-in', () => {
  let t: TestApp;
  const google = new FakeGoogle();

  beforeAll(async () => {
    vi.stubGlobal('fetch', google.wrap(globalThis.fetch));
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
    vi.unstubAllGlobals();
  });

  const client = () => {
    const ip = `10.1.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
    const agent = request.agent(t.app.getHttpServer());
    const post = (path: string, body: object) =>
      agent.post(`/api/auth${path}`).set('Origin', ORIGIN).set('X-Forwarded-For', ip).send(body);
    const get = (path: string) => agent.get(path).set('X-Forwarded-For', ip);
    return { post, get };
  };
  type Client = ReturnType<typeof client>;

  const newEmail = () => `${randomUUID()}@example.com`;

  // The browser round trip: start on our API, "consent" at Google, come back to the callback with a code.
  const signInWithGoogle = async (c: Client, profile: GoogleProfile) => {
    const start = await c.post('/sign-in/social', { provider: 'google', callbackURL: '/' }).expect(200);
    const state = new URL(start.body.url).searchParams.get('state')!;
    const back = await c.get(`/api/auth/callback/google?code=${google.codeFor(profile)}&state=${state}`).expect(302);
    expect(back.headers.location).toBe('/');
    const session = await c.get('/api/auth/get-session').expect(200);
    return session.body.user;
  };

  const signUp = (c: Client, email: string) =>
    c.post('/sign-up/email', { name: 'Ann Customer', email, password: PASSWORD }).expect(200);

  const verifyEmail = async (c: Client, email: string) => {
    let link = '';
    await vi.waitFor(() => {
      const mail = t.mailbox.sent.find((m) => m.to === email && /verify/i.test(String(m.subject)));
      link = /https?:\/\/\S+/.exec(String(mail?.text))![0];
    });
    const url = new URL(link);
    await c.get(url.pathname + url.search).expect(302);
  };

  it('creates a verified Customer on first sign-in', async () => {
    const email = newEmail();

    const user = await signInWithGoogle(client(), { sub: randomUUID(), email });

    expect(user).toMatchObject({ email, emailVerified: true, role: 'customer' });
  });

  it('logs an existing Google user back into the same account', async () => {
    const profile = { sub: randomUUID(), email: newEmail() };
    const first = await signInWithGoogle(client(), profile);

    const again = await signInWithGoogle(client(), profile);

    expect(again.id).toBe(first.id);
  });

  it('links to the verified password account with the same email, which keeps its password', async () => {
    const c = client();
    const email = newEmail();
    const passwordUser = (await signUp(c, email)).body.user;
    await verifyEmail(c, email);

    const googleUser = await signInWithGoogle(client(), { sub: randomUUID(), email });

    expect(googleUser.id).toBe(passwordUser.id);
    const login = await c.post('/sign-in/email', { email, password: PASSWORD }).expect(200);
    expect(login.body.user.id).toBe(passwordUser.id);
  });

  it('takes over an unverified password account for the Google owner and kills the password set on it', async () => {
    // Someone else pre-registered the victim's email with a password they know, and never verified it.
    const attacker = client();
    const email = newEmail();
    const preRegistered = (await signUp(attacker, email)).body.user;

    const user = await signInWithGoogle(client(), { sub: randomUUID(), email });

    expect(user).toMatchObject({ id: preRegistered.id, emailVerified: true });
    // Now that the email is verified the attacker's password would let them in; it must be gone.
    const login = await attacker.post('/sign-in/email', { email, password: PASSWORD });
    expect(login.status).toBe(401);
  });
});
