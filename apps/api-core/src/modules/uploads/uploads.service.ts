import { Inject, Injectable } from '@nestjs/common';
import { extname } from 'node:path';
import { v4 as uuidv4 } from 'uuid';

import { AppException } from '../../common/errors/app.exception';
import { ERROR_CODES } from '../../common/errors/error-codes';
import type { PresignUploadDto } from './dto/upload.dto';
import {
  ALLOWED_CONTENT_TYPES,
  MAX_UPLOAD_BYTES,
  STORAGE_DRIVER,
  type PresignedUpload,
  type StorageDriver,
} from './storage/storage.driver';

export interface PresignResult extends PresignedUpload {
  /** Which backend served the presign — `local` in a keyless dev environment. */
  driver: 's3' | 'local';
  maxSizeBytes: number;
}

@Injectable()
export class UploadsService {
  constructor(@Inject(STORAGE_DRIVER) private readonly storage: StorageDriver) {}

  get driver(): StorageDriver {
    return this.storage;
  }

  async presign(dto: PresignUploadDto): Promise<PresignResult> {
    const extension = this.extensionFor(dto.contentType, dto.filename);
    const key = `${dto.folder}/${uuidv4()}.${extension}`;

    const presigned = await this.storage.presignUpload({
      key,
      contentType: dto.contentType,
      maxSizeBytes: MAX_UPLOAD_BYTES,
    });

    return { ...presigned, driver: this.storage.kind, maxSizeBytes: MAX_UPLOAD_BYTES };
  }

  async remove(key: string): Promise<{ key: string; deleted: true }> {
    this.assertSafeKey(key);
    await this.storage.delete(key);
    return { key, deleted: true };
  }

  publicUrl(key: string): string {
    this.assertSafeKey(key);
    return this.storage.publicUrl(key);
  }

  /**
   * Trusts the declared content type (it is on the allow-list) but prefers the
   * original extension when the two agree, so `.jpeg` is not rewritten to `.jpg`.
   */
  private extensionFor(contentType: string, filename: string): string {
    const canonical = ALLOWED_CONTENT_TYPES[contentType];

    if (!canonical) {
      throw AppException.badRequest(
        `Unsupported content type "${contentType}"`,
        ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
        [{ field: 'contentType', message: 'not allowed', rule: 'allowlist' }],
      );
    }

    const original = extname(filename).replace('.', '').toLowerCase();
    const isEquivalent =
      original === canonical || (canonical === 'jpg' && original === 'jpeg');

    return isEquivalent && /^[a-z0-9]{1,5}$/.test(original) ? original : canonical;
  }

  /** Keys are server-generated; reject anything that looks authored. */
  private assertSafeKey(key: string): void {
    const safe = /^[a-z0-9-]+\/[A-Za-z0-9._-]+$/.test(key) && !key.includes('..');

    if (!safe) {
      throw AppException.badRequest(
        'Invalid object key',
        ERROR_CODES.INVALID_IDENTIFIER,
        [{ field: 'key', message: 'malformed object key', rule: 'pattern' }],
      );
    }
  }
}
