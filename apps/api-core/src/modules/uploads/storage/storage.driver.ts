/** Storage abstraction so S3 and the keyless local fallback are interchangeable. */

export interface PresignedUpload {
  /** Where the client PUTs the bytes. */
  uploadUrl: string;
  /** Object key, stored on the listing document. */
  key: string;
  /** Where the object will be readable once uploaded. */
  publicUrl: string;
  /** Seconds until `uploadUrl` stops working. */
  expiresIn: number;
  /** Headers the client must replay on the PUT. */
  requiredHeaders: Record<string, string>;
}

export interface PresignRequest {
  key: string;
  contentType: string;
  /** Advisory maximum, enforced by the driver where the backend supports it. */
  maxSizeBytes: number;
}

export interface StorageDriver {
  /** `s3` or `local` — surfaced in responses so the UI can adapt. */
  readonly kind: 's3' | 'local';

  presignUpload(request: PresignRequest): Promise<PresignedUpload>;

  /** Public read URL for an existing key. */
  publicUrl(key: string): string;

  delete(key: string): Promise<void>;

  exists(key: string): Promise<boolean>;
}

export const STORAGE_DRIVER = Symbol('STORAGE_DRIVER');

/** Content types accepted for listing media and avatars. */
export const ALLOWED_CONTENT_TYPES: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
};

/** Folders a caller may upload into — prevents path traversal by construction. */
export const ALLOWED_FOLDERS = [
  'properties',
  'compounds',
  'developers',
  'areas',
  'avatars',
  'floor-plans',
  'documents',
] as const;

export type UploadFolder = (typeof ALLOWED_FOLDERS)[number];

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MiB
