import { z } from 'zod';

/**
 * Every environment variable consumed by `api-core`.
 *
 * Names are contractual — see `docs/CONTRACT.md` §7. Nothing here may be renamed
 * and no service-specific alternatives may be invented.
 */

const DURATION_PATTERN = /^\d+\s*(ms|s|m|h|d|w|y)?$/i;

const isParsableUrl = (value: string): boolean => {
  try {
    // eslint-disable-next-line no-new
    new URL(value);
    return true;
  } catch {
    return false;
  }
};

/** `FRONTEND_URL` may hold a single origin or a comma separated allow-list. */
const originList = z
  .string()
  .min(1)
  .refine(
    (value) =>
      value
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
        .every(isParsableUrl),
    { message: 'must be an absolute URL (or a comma separated list of absolute URLs)' },
  );

const duration = (fallback: string) =>
  z
    .string()
    .default(fallback)
    .refine((value) => DURATION_PATTERN.test(value.trim()), {
      message: 'must be a duration such as "15m", "30d", "3600s" or a plain number of milliseconds',
    });

export const envSchema = z.object({
  // --- shared ---------------------------------------------------------------
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: z.string().min(1).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  FRONTEND_URL: originList,
  PUBLIC_API_URL: z.string().min(1).default('https://localhost/api/v1'),
  INTERNAL_SERVICE_TOKEN: z
    .string()
    .min(8, { message: 'must be at least 8 characters (shared service-to-service token)' }),

  // --- auth -----------------------------------------------------------------
  JWT_ACCESS_SECRET: z.string().min(32, { message: 'must be at least 32 characters' }),
  JWT_REFRESH_SECRET: z.string().min(32, { message: 'must be at least 32 characters' }),
  JWT_ACCESS_TTL: duration('15m'),
  JWT_REFRESH_TTL: duration('30d'),
  JWT_ISSUER: z.string().min(1).default('topchoice-api'),
  JWT_AUDIENCE: z.string().min(1).default('topchoice-clients'),
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_CALLBACK_URL: z
    .string()
    .default('https://localhost/api/v1/auth/google/callback')
    .refine((value) => value === '' || isParsableUrl(value), {
      message: 'must be an absolute URL',
    }),

  // --- postgres (Prisma) ----------------------------------------------------
  DATABASE_URL: z
    .string()
    .min(1)
    .refine((value) => value.startsWith('postgres://') || value.startsWith('postgresql://'), {
      message: 'must be a postgresql:// connection string',
    }),

  // --- mongo ----------------------------------------------------------------
  MONGO_URI: z
    .string()
    .min(1)
    .refine((value) => value.startsWith('mongodb://') || value.startsWith('mongodb+srv://'), {
      message: 'must be a mongodb:// connection string',
    }),

  // --- redis ----------------------------------------------------------------
  REDIS_URL: z
    .string()
    .min(1)
    .refine((value) => value.startsWith('redis://') || value.startsWith('rediss://'), {
      message: 'must be a redis:// connection string',
    }),
  REDIS_TTL_DEFAULT: z.coerce.number().int().min(1).default(300),

  // --- aws / s3 -------------------------------------------------------------
  AWS_REGION: z.string().min(1).default('eu-central-1'),
  AWS_ACCESS_KEY_ID: z.string().default(''),
  AWS_SECRET_ACCESS_KEY: z.string().default(''),
  S3_BUCKET: z.string().min(1).default('topchoice-media'),
  S3_PUBLIC_BASE_URL: z.string().default(''),
  CLOUDFRONT_DOMAIN: z.string().default(''),

  // --- internal service urls ------------------------------------------------
  API_CORE_URL: z.string().min(1).default('http://api-core:4000'),
  SEARCH_SVC_URL: z.string().min(1).default('http://search-svc:8000'),
  RAG_SVC_URL: z.string().min(1).default('http://rag-svc:8001'),
  REPORTS_SVC_URL: z.string().min(1).default('http://reports-svc:4567'),
});

export type Env = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(
      [
        'Invalid environment configuration for api-core:',
        ...issues.map((issue) => `  - ${issue}`),
        '',
        'Copy .env.example to .env at the repository root and fill in the blanks.',
        'Variable names are defined by docs/CONTRACT.md §7 and must not be renamed.',
      ].join('\n'),
    );
    this.name = 'EnvValidationError';
  }
}

let cachedEnv: Env | null = null;

/**
 * Parses + validates the raw environment. Throws a single readable error that
 * lists **every** offending variable so boot failures are fixable in one pass.
 */
export function validateEnv(raw: Record<string, unknown> = process.env): Env {
  const parsed = envSchema.safeParse(raw);

  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => {
      const name = issue.path.join('.') || '(root)';
      const message =
        issue.code === 'invalid_type' && issue.message === 'Required'
          ? 'is missing'
          : issue.message;
      return `${name}: ${message}`;
    });
    throw new EnvValidationError(issues);
  }

  cachedEnv = parsed.data;
  return parsed.data;
}

/** Returns the validated environment, validating lazily on first access. */
export function getEnv(): Env {
  return cachedEnv ?? validateEnv(process.env);
}

/** Test helper — drops the memoised environment. */
export function resetEnvCache(): void {
  cachedEnv = null;
}
