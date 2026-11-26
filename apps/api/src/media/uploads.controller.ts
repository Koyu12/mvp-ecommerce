import { randomUUID } from 'node:crypto';
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { IMAGE_TYPES, UploadRequest, type UploadTarget } from '@mvp/shared';
import { AdminGuard } from '../auth/admin.guard';
import { parseBody } from '../common/parse-body';
import { Presigner, publicImageBase } from './presigner';

// The browser uploads straight to storage with the presigned URL, then saves `url` on a Product or Variant.
@Controller('admin/uploads')
@UseGuards(AdminGuard)
export class UploadsController {
  constructor(private readonly presigner: Presigner) {}

  @Post()
  async create(@Body() body: unknown): Promise<UploadTarget> {
    const { contentType, size } = parseBody(UploadRequest, body);
    const key = `images/${randomUUID()}.${IMAGE_TYPES[contentType]}`;
    const uploadUrl = await this.presigner.presignPut({ key, contentType, size });
    return { uploadUrl, url: `${publicImageBase()}/${key}` };
  }
}
