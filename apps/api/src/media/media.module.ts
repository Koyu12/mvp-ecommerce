import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { Presigner, S3Presigner } from './presigner';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

// isStoredImage and publicImageBase in ./presigner are plain functions: import them directly, no module needed.
@Module({
  imports: [AuthModule],
  controllers: [UploadsController],
  providers: [{ provide: Presigner, useClass: S3Presigner }, UploadsService],
  exports: [Presigner],
})
export class MediaModule {}
