import { z } from 'zod';
import { optional, required } from './text';

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
