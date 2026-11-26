import { z } from 'zod';

// Blank optional text is stored as null; required text is trimmed and must be non-empty.
export const required = (max: number) => z.string().trim().min(1).max(max);
export const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((s) => s || null);
