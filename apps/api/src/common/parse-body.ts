import { BadRequestException } from '@nestjs/common';

type Schema<T> = {
  safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } };
};

// Validates a request body against a @mvp/shared zod schema; unknown keys (such as userId) are stripped.
export function parseBody<T>(schema: Schema<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException(result.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
  }
  return result.data;
}
