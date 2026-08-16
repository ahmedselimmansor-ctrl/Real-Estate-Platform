import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as reachable without an access token. The global JWT guard
 * (stage 2) skips any handler carrying this metadata.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
