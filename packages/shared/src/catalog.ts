import { z } from 'zod';
import { idr } from './money';
import { required } from './text';

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
// Setting Stock needs the Stock the Admin last saw: checkout decrements it concurrently, so a stale form must
// get 409 rather than overwrite a reservation.
export const VariantUpdate = VariantInput.extend({ archived: z.boolean(), expectedStock: z.int().min(0) })
  .partial()
  .refine((v) => v.stock === undefined || v.expectedStock !== undefined, {
    path: ['expectedStock'],
    message: 'required when setting stock',
  });
export type VariantUpdate = z.input<typeof VariantUpdate>;

// What a Variant sells for: its own price if set, otherwise its Product's.
export const effectivePrice = (variant: { price: number | null }, product: { price: number }) =>
  variant.price ?? product.price;

// At or below this Stock, a Variant shows "only N left".
export const LOW_STOCK = 5;
export const LowStockQuery = z.object({ below: z.coerce.number().pipe(z.int().min(1).max(1_000_000)).default(LOW_STOCK) });

// low_stock: at or below LOW_STOCK, or fewer left than the quantity wanted.
export type StockState = 'in_stock' | 'low_stock' | 'out_of_stock';
export const stockState = (stock: number, quantity = 0): StockState =>
  stock === 0 ? 'out_of_stock' : stock <= LOW_STOCK || stock < quantity ? 'low_stock' : 'in_stock';

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
