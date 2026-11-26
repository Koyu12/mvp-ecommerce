import { z } from 'zod';

// An Admin's request for a presigned image upload URL. SVG is left out because it can carry scripts.
export const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const UploadRequest = z.object({
  contentType: z.enum(Object.keys(IMAGE_TYPES) as [keyof typeof IMAGE_TYPES]),
  size: z.int().min(1).max(MAX_IMAGE_BYTES),
});
export type UploadRequest = z.input<typeof UploadRequest>;
export type UploadTarget = { uploadUrl: string; url: string };
