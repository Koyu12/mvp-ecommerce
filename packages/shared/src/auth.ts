export const ADMIN = 'admin';
export type Role = 'customer' | typeof ADMIN;
// Better Auth stores several roles as a comma-separated list.
export const isAdmin = (user: { role?: unknown } | null | undefined) =>
  typeof user?.role === 'string' && user.role.split(',').includes(ADMIN);

// The one form an email is looked up and stored in.
export const normaliseEmail = (email: string) => email.trim().toLowerCase();
