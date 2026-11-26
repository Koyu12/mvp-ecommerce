import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { IMAGE_TYPES, type UploadRequest, type UploadTarget } from '@mvp/shared';
import { Presigner, publicImageBase } from './presigner';

// The browser uploads straight to storage with the presigned URL, then saves `url` on a Product or Variant.
@Injectable()
export class UploadsService {
  constructor(private readonly presigner: Presigner) {}

  async create({ contentType, size }: UploadRequest): Promise<UploadTarget> {
    const key = `images/${randomUUID()}.${IMAGE_TYPES[contentType]}`;
    const uploadUrl = await this.presigner.presignPut({ key, contentType, size });
    return { uploadUrl, url: `${publicImageBase()}/${key}` };
  }
}
