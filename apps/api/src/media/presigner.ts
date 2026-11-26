import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';

export type PresignRequest = { key: string; contentType: string; size: number };

// Signs browser uploads to S3-compatible storage (MinIO locally, R2 in production). Tests swap in a fake.
export abstract class Presigner {
  /** A URL the browser can PUT exactly this object to, with this Content-Type and Content-Length. */
  abstract presignPut(request: PresignRequest): Promise<string>;
}

@Injectable()
export class S3Presigner extends Presigner {
  private readonly bucket = process.env.S3_BUCKET ?? 'images';
  private readonly s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
    region: process.env.S3_REGION ?? 'auto',
    // Path-style works on both MinIO and R2.
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? 'minioadmin',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? 'minioadmin',
    },
  });

  presignPut({ key, contentType, size }: PresignRequest): Promise<string> {
    // Content-Type and Content-Length are signed, so storage refuses any other type or size.
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType, ContentLength: size });
    return getSignedUrl(this.s3, command, { expiresIn: 300 });
  }
}

// Where uploaded objects are served from, e.g. the R2 bucket's public domain.
export const publicImageBase = () => (process.env.STORAGE_PUBLIC_URL ?? 'http://localhost:9000/images').replace(/\/$/, '');

/** True for URLs that point into our own storage; nothing else may be saved as an image. */
export const isStoredImage = (url: string) => url.startsWith(`${publicImageBase()}/`);
