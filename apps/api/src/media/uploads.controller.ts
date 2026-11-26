import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { UploadRequest, type UploadTarget } from '@mvp/shared';
import { AdminGuard } from '../auth/admin.guard';
import { parseBody } from '../common/parse-body';
import { UploadsService } from './uploads.service';

@Controller('admin/uploads')
@UseGuards(AdminGuard)
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post()
  create(@Body() body: unknown): Promise<UploadTarget> {
    return this.uploads.create(parseBody(UploadRequest, body));
  }
}
