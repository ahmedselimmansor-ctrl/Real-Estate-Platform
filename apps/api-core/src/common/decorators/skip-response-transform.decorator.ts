import { SetMetadata } from '@nestjs/common';

export const SKIP_RESPONSE_TRANSFORM_KEY = 'skipResponseTransform';

/**
 * Opts a handler (or a whole controller) out of the CONTRACT §4 success
 * envelope — used by `/health`, redirects and binary responses.
 */
export const SkipResponseTransform = () => SetMetadata(SKIP_RESPONSE_TRANSFORM_KEY, true);
