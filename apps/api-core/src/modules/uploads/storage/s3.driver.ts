import { Logger } from '@nestjs/common';
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { AppException } from '../../../common/errors/app.exception';
import { ERROR_CODES } from '../../../common/errors/error-codes';
import type { StorageConfig } from '../../../config/configuration';
import type { PresignRequest, PresignedUpload, StorageDriver } from './storage.driver';

const PRESIGN_TTL_SECONDS = 900; // 15 minutes

/**
 * AWS S3 storage (CONTRACT §7 `S3_BUCKET`, `AWS_*`).
 *
 * Uploads are browser-direct via a presigned PUT, so listing media never
 * transits the API process. Reads go through CloudFront when configured.
 */
export class S3StorageDriver implements StorageDriver {
  readonly kind = 's3' as const;

  private readonly logger = new Logger(S3StorageDriver.name);
  private readonly client: S3Client;

  constructor(private readonly config: StorageConfig) {
    this.client = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async presignUpload(request: PresignRequest): Promise<PresignedUpload> {
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: request.key,
      ContentType: request.contentType,
      // Objects are served through CloudFront with an OAC; the bucket itself
      // stays private, so no ACL is set here.
      CacheControl: 'public, max-age=31536000, immutable',
    });

    try {
      const uploadUrl = await getSignedUrl(this.client, command, {
        expiresIn: PRESIGN_TTL_SECONDS,
      });

      return {
        uploadUrl,
        key: request.key,
        publicUrl: this.publicUrl(request.key),
        expiresIn: PRESIGN_TTL_SECONDS,
        requiredHeaders: { 'Content-Type': request.contentType },
      };
    } catch (error) {
      this.logger.error(`could not presign upload for ${request.key}: ${String(error)}`);
      throw AppException.serviceUnavailable(
        'Could not prepare the upload — object storage is unavailable',
        ERROR_CODES.UPLOAD_FAILED,
      );
    }
  }

  publicUrl(key: string): string {
    const base = this.config.cloudfrontDomain
      ? `https://${this.config.cloudfrontDomain}`
      : this.config.publicBaseUrl;

    return `${base.replace(/\/+$/, '')}/${key}`;
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );
    } catch (error) {
      this.logger.error(`could not delete ${key}: ${String(error)}`);
      throw AppException.serviceUnavailable(
        'Could not delete the object from storage',
        ERROR_CODES.UPLOAD_FAILED,
      );
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }
}
