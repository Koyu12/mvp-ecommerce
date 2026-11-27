// The web app's origin, for links in emails and payment redirects. Better Auth uses the same origin.
export const webUrl = () => process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';
