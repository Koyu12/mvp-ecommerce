import { z } from 'zod';

const DependencyStatus = z.enum(['up', 'down']);

export const HealthResponse = z.object({
  status: z.enum(['ok', 'degraded']),
  database: DependencyStatus,
  redis: DependencyStatus,
  time: z.iso.datetime(),
});
export type HealthResponse = z.infer<typeof HealthResponse>;
