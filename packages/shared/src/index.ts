import { z } from 'zod';

const DependencyStatus = z.enum(['up', 'down']);

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

export const Address = z.object({
  id: z.string(),
  recipientName: z.string(),
  phone: z.string(),
  line1: z.string(),
  line2: z.string().nullable(),
  city: z.string(),
  region: z.string(),
  postalCode: z.string(),
});
export type Address = z.infer<typeof Address>;
