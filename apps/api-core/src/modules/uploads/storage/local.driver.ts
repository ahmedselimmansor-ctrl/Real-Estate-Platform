import { Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createReadStream, type ReadStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import { dirname, join, normalize, resolve, sep } from 'node:path';

import { AppException } from '../../../common/errors/app.exception';
import { ERROR_CODES } from '../../../common/errors/error-codes';
import type { PresignRequest, PresignedUpload, StorageDriver } from './storage.driver';

const PRESIGN_TTL_SECONDS = 900;

export interface LocalDriverOptions {
  /** Absolute directory the objects are written under. */
  rootDir: string;
  /** Public base for the API, e.g. `https://localhost/api/v1`. */
  publicApiUrl: string;
  /** Secret used to sign upload URLs. */
  signingSecret: string;
}

/**
 * Filesystem fallback used when no AWS credentials are configured, so the whole
 * platform runs end-to-end without an AWS account (CONTRACT §7 note).
 *
 * It mimics the presigned-PUT flow: `presignUpload` returns a URL back into this
 * API carrying an HMAC signature and expiry, which `UploadsController` verifies
 * before writing bytes. Not intended for production — `S3StorageDriver` is.
 */
export class LocalStorageDriver implements StorageDriver {
  readonly kind = 'local' as const;

  private readonly logger = new Logger(LocalStorageDriver.name);

  constructor(private readonly options: LocalDriverOptions) {}

  async presignUpload(request: PresignRequest): Promise<PresignedUpload> {
    const expiresAt = Math.floor(Date.now() / 1000) + PRESIGN_TTL_SECONDS;
    const signature = this.sign(request.key, expiresAt);

    const params = new URLSearchParams({
      key: request.key,
      exp: String(expiresAt),
      sig: signature,
    });

    return {
      uploadUrl: `${this.options.publicApiUrl}/uploads/local?${params.toString()}`,
      key: request.key,
      publicUrl: this.publicUrl(request.key),
      expiresIn: PRESIGN_TTL_SECONDS,
      requiredHeaders: { 'Content-Type': request.contentType },
    };
  }

  publicUrl(key: string): string {
    return `${this.options.publicApiUrl}/uploads/file?key=${encodeURIComponent(key)}`;
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolveKey(key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      const info = await stat(this.resolveKey(key));
      return info.isFile();
    } catch {
      return false;
    }
  }

  // ----------------------------------------------- upload-endpoint plumbing --

  /** Constant-time check of the signature and expiry on a local upload URL. */
  verifyUploadSignature(key: string, expiresAt: number, signature: string): void {
    if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) {
      throw AppException.forbidden('This upload link has expired', ERROR_CODES.UPLOAD_FAILED);
    }

    const expected = Buffer.from(this.sign(key, expiresAt), 'hex');
    const provided = Buffer.from(signature, 'hex');

    if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
      throw AppException.forbidden('Invalid upload signature', ERROR_CODES.UPLOAD_FAILED);
    }
  }

  /** Absolute on-disk path for a key, guarded against traversal. */
  resolveKey(key: string): string {
    const root = resolve(this.options.rootDir);
    const target = resolve(join(root, normalize(key)));

    if (target !== root && !target.startsWith(root + sep)) {
      throw AppException.badRequest('Invalid object key', ERROR_CODES.INVALID_IDENTIFIER);
    }

    return target;
  }

  async ensureDirectoryFor(key: string): Promise<string> {
    const target = this.resolveKey(key);
    await mkdir(dirname(target), { recursive: true });
    return target;
  }

  createReadStream(key: string): ReadStream {
    return createReadStream(this.resolveKey(key));
  }

  async sizeOf(key: string): Promise<number> {
    const info = await stat(this.resolveKey(key));
    return info.size;
  }

  private sign(key: string, expiresAt: number): string {
    return createHmac('sha256', this.options.signingSecret)
      .update(`${key}:${expiresAt}`)
      .digest('hex');
  }

  logStartup(): void {
    this.logger.warn(
      `AWS credentials are not configured — uploads are being written to ${this.options.rootDir}. ` +
        'Set AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY to use S3.',
    );
  }
}
