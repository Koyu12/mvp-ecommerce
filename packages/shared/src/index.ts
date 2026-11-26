import { z } from 'zod';

const DependencyStatus = z.enum(['up', 'down']);

export const ADMIN = 'admin';
export type Role = 'customer' | typeof ADMIN;
// Better Auth stores several roles as a comma-separated list.
export const isAdmin = (user: { role?: unknown } | null | undefined) =>
  typeof user?.role === 'string' && user.role.split(',').includes(ADMIN);

// The one form an email is looked up and stored in.
export const normaliseEmail = (email: string) => email.trim().toLowerCase();

export const HealthResponse = z.object({
  status: z.enum(['ok', 'degraded']),
  database: DependencyStatus,
  redis: DependencyStatus,
  time: z.iso.datetime(),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

// Blank optional text is stored as null; required text is trimmed and must be non-empty.
const required = (max: number) => z.string().trim().min(1).max(max);
const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((s) => s || null);

export const Profile = z.object({ name: z.string(), email: z.string(), phone: z.string().nullable() });
export type Profile = z.infer<typeof Profile>;

export const ProfileUpdate = z.object({ name: required(100), phone: optional(30) }).partial();
export type ProfileUpdate = z.input<typeof ProfileUpdate>;

export const AddressInput = z.object({
  recipientName: required(100),
  phone: required(30),
  line1: required(200),
  line2: optional(200).optional(),
  city: required(100),
  region: required(100),
  postalCode: required(20),
});
export type AddressInput = z.input<typeof AddressInput>;
export const AddressUpdate = AddressInput.partial();

// A saved Address: the parsed input fields, every one present (line2 may be null), plus its id.
export type Address = { id: string } & Required<z.output<typeof AddressInput>>;

// Store settings, editable by Admins. The Shipping fee is integer IDR, capped at Postgres' 4-byte int.
export const StoreSettings = z.object({ shippingFee: z.number().int().min(0).max(2_147_483_647) });
export type StoreSettings = z.infer<typeof StoreSettings>;
