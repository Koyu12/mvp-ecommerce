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
  // Uploaded image URLs, in display order; the first is the main image.
  images: z.array(z.url()).max(10).optional(),
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
  // An uploaded image URL showing this Variant, such as its colour; null clears it.
  image: z.url().nullable().optional(),
});
export type VariantInput = z.input<typeof VariantInput>;
export const VariantUpdate = VariantInput.extend({ archived: z.boolean() }).partial();
export type VariantUpdate = z.input<typeof VariantUpdate>;

// What a Variant sells for: its own price if set, otherwise its Product's.
export const effectivePrice = (variant: { price: number | null }, product: { price: number }) =>
  variant.price ?? product.price;

// At or below this Stock, a Variant shows "only N left".
export const LOW_STOCK = 5;
export const LowStockQuery = z.object({ below: z.coerce.number().pipe(z.int().min(1).max(1_000_000)).default(LOW_STOCK) });

export type AdminVariant = {
  id: string;
  productId: string;
  sku: string;
  stock: number;
  price: number | null;
  effectivePrice: number;
  archived: boolean;
  optionValueIds: string[];
  image: string | null;
};
export type AdminProduct = {
  id: string;
  name: string;
  description: string;
  categoryId: string;
  price: number;
  archived: boolean;
  optionTypeIds: string[];
  images: string[];
  variants: AdminVariant[];
};
export type LowStockVariant = AdminVariant & { productName: string };

// An Admin's request for a presigned image upload URL. SVG is left out because it can carry scripts.
export const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const UploadRequest = z.object({
  contentType: z.enum(Object.keys(IMAGE_TYPES) as [keyof typeof IMAGE_TYPES]),
  size: z.int().min(1).max(MAX_IMAGE_BYTES),
});
export type UploadRequest = z.input<typeof UploadRequest>;
export type UploadTarget = { uploadUrl: string; url: string };

// Store settings, editable by Admins. The Shipping fee is integer IDR.
export const StoreSettings = z.object({ shippingFee: idr });
export type StoreSettings = z.infer<typeof StoreSettings>;

// Storefront. Public, so only Products and Variants on sale (not Archived) ever appear.
const csv = z
  .string()
  .transform((s) => s.split(',').filter(Boolean))
  .pipe(ids);
const amount = z.coerce.number().pipe(idr);
export const StorefrontQuery = z.object({
  categoryId: z.string().min(1).optional(),
  // Name search.
  q: z.string().trim().max(100).optional(),
  minPrice: amount.optional(),
  maxPrice: amount.optional(),
  // Option value ids, comma-separated. Values of one Option type are alternatives (M or L); different types must all match (M and Red).
  optionValueIds: csv.optional(),
  page: z.coerce.number().pipe(z.int().min(1).max(10_000)).default(1),
  pageSize: z.coerce.number().pipe(z.int().min(1).max(50)).default(20),
});
export type StorefrontQuery = z.input<typeof StorefrontQuery>;

export type ProductSummary = {
  id: string;
  name: string;
  categoryId: string;
  // Lowest effective price among its Variants on sale.
  fromPrice: number;
  inStock: boolean;
  // Its main image, if it has any.
  image: string | null;
};
export type ProductPage = { items: ProductSummary[]; total: number; page: number; pageSize: number };

export type StorefrontVariant = { id: string; optionValueIds: string[]; effectivePrice: number; stock: number; image: string | null };
export type StorefrontProduct = {
  id: string;
  name: string;
  description: string;
  category: Category;
  images: string[];
  // Only the Option values some Variant on sale uses, so every pick can resolve to a Variant.
  optionTypes: OptionType[];
  variants: StorefrontVariant[];
};

// Cart. It holds Variants and quantities only; prices and Stock are read live on every Cart read.
export const MAX_CART_QUANTITY = 99;
const cartQuantity = z.int().min(1).max(MAX_CART_QUANTITY);
export const CartItemInput = z.object({ variantId: z.string().min(1), quantity: cartQuantity });
export type CartItemInput = z.input<typeof CartItemInput>;
export const CartQuantity = z.object({ quantity: cartQuantity });
export type CartQuantity = z.input<typeof CartQuantity>;
// low_stock: at or below LOW_STOCK, or fewer left than the quantity wanted.
export type StockState = 'in_stock' | 'low_stock' | 'out_of_stock';
export const stockState = (stock: number, quantity = 0): StockState =>
  stock === 0 ? 'out_of_stock' : stock <= LOW_STOCK || stock < quantity ? 'low_stock' : 'in_stock';
// archived: the Variant or its Product is no longer sold.
export type CartAvailability = StockState | 'archived';
export type CartLine = {
  variantId: string;
  productId: string;
  productName: string;
  sku: string;
  options: string[];
  quantity: number;
  // Live effective price, and the one the Customer saw when they last added the item.
  unitPrice: number;
  addedPrice: number;
  priceChanged: boolean;
  lineTotal: number;
  stock: number;
  availability: CartAvailability;
};
// subtotal counts only lines that can be bought now (not archived, not out of stock). shippingFee is the
// live Store setting, or 0 when no line can be bought; total = subtotal + shippingFee. Checkout snapshots both.
export type Cart = { items: CartLine[]; subtotal: number; shippingFee: number; total: number };
