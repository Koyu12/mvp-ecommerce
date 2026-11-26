import { createAuthClient } from 'better-auth/react';

// Talks to /api/auth on the web origin, which next.config.ts proxies to the API (ADR 0001).
export const authClient = createAuthClient();
