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

// Catalog. All amounts are integers in IDR; a Postgres INTEGER holds up to about 2.1 billion.
const idr = z.int().min(0).max(2_000_000_000);
const ids = z.array(z.string().min(1)).max(20);

// A Category or an Option type.
export const NameInput = z.object({ name: required(100) });
export type NameInput = z.input<typeof NameInput>;
export type Category = { id: string; name: string };

export const OptionValueInput = z.object({ value: required(50) });
export type OptionValueInput = z.input<typeof OptionValueInput>;
export type OptionValue = { id: string; value: string };
export type OptionType = { id: string; name: string; values: OptionValue[] };

export const ProductInput = z.object({
  name: required(200),
  description: z.string().trim().max(5000),
  categoryId: z.string().min(1),
  price: idr,
  // The Option types whose values tell its Variants apart, such as Size and Colour.
  optionTypeIds: ids,
});
export type ProductInput = z.input<typeof ProductInput>;
export const ProductUpdate = ProductInput.extend({ archived: z.boolean() }).partial();
export type ProductUpdate = z.input<typeof ProductUpdate>;

export const VariantInput = z.object({
  sku: required(64),
  stock: z.int().min(0).max(1_000_000),
  // Overrides the Product price; null or left out means the Product price applies.
  price: idr.nullable().optional(),
  // Exactly one per Option type of the Product.
  optionValueIds: ids,
});
export type VariantInput = z.input<typeof VariantInput>;
export const VariantUpdate = VariantInput.extend({ archived: z.boolean() }).partial();
export type VariantUpdate = z.input<typeof VariantUpdate>;

// What a Variant sells for: its own price if set, otherwise its Product's.
export const effectivePrice = (variant: { price: number | null }, product: { price: number }) =>
  variant.price ?? product.price;

export const LowStockQuery = z.object({ below: z.coerce.number().pipe(z.int().min(1).max(1_000_000)).default(5) });

export type AdminVariant = {
  id: string;
  productId: string;
  sku: string;
  stock: number;
  price: number | null;
  effectivePrice: number;
  archived: boolean;
  optionValueIds: string[];
};
export type AdminProduct = {
  id: string;
  name: string;
  description: string;
  categoryId: string;
  price: number;
  archived: boolean;
  optionTypeIds: string[];
  variants: AdminVariant[];
};
export type LowStockVariant = AdminVariant & { productName: string };

// Store settings, editable by Admins. The Shipping fee is integer IDR, capped at Postgres' 4-byte int.
export const StoreSettings = z.object({ shippingFee: z.number().int().min(0).max(2_147_483_647) });
export type StoreSettings = z.infer<typeof StoreSettings>;
