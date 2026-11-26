import { z } from 'zod';

// All amounts are integers in IDR; a Postgres INTEGER holds up to about 2.1 billion.
export const idr = z.int().min(0).max(2_000_000_000);
