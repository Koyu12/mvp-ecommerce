import type { UploadTarget } from '@mvp/shared';
import { api } from './api';

// Uploads an image straight to storage through a presigned URL, then answers the URL to save on a Product or Variant.
export async function uploadImage(file: File) {
  const target = await api<UploadTarget>('/admin/uploads', 'POST', { contentType: file.type, size: file.size });
  if (!target.data) return { url: null, error: target.error.message ?? 'Could not start the upload.' };
  const res = await fetch(target.data.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file }).catch(() => null);
  if (!res?.ok) return { url: null, error: 'The upload failed. Try again.' };
  return { url: target.data.url, error: null };
}
