import { Env, getEnv } from './env.schema';

export interface AppRuntimeConfig {
  nodeEnv: 'development' | 'test' | 'production';
  appEnv: string;
  port: number;
  /** Allowed browser origins (CORS) derived from FRONTEND_URL. */
  corsOrigins: string[];
  frontendUrl: string;
  publicApiUrl: string;
  internalServiceToken: string;
}

export interface JwtConfig {
  accessSecret: string;
  refreshSecret: string;
  accessTtl: string;
  refreshTtl: string;
  issuer: string;
  audience: string;
}

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  /** OAuth routes short-circuit with a 503 when credentials are absent. */
  enabled: boolean;
}

export interface DatabaseConfig {
  url: string;
}

export interface MongoConfig {
  uri: string;
}

export interface RedisConfig {
  url: string;
  defaultTtlSeconds: number;
}

export interface StorageConfig {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
  cloudfrontDomain: string;
  /** Real S3 credentials present — otherwise uploads run in stub mode. */
  enabled: boolean;
}

export interface ServiceUrlsConfig {
  apiCore: string;
  search: string;
  rag: string;
  reports: string;
}

/**
 * Declared as a type alias (not an interface) so it keeps the implicit index
 * signature `ConfigModule`'s `ConfigFactory` requires.
 */
export type AppConfig = {
  app: AppRuntimeConfig;
  jwt: JwtConfig;
  google: GoogleOAuthConfig;
  database: DatabaseConfig;
  mongo: MongoConfig;
  redis: RedisConfig;
  storage: StorageConfig;
  services: ServiceUrlsConfig;
};

const splitOrigins = (value: string): string[] => {
  const origins = value
    .split(',')
    .map((part) => part.trim().replace(/\/+$/, ''))
    .filter((part) => part.length > 0);
  return Array.from(new Set(origins));
};

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

export function buildConfig(env: Env): AppConfig {
  const corsOrigins = splitOrigins(env.FRONTEND_URL);

  return {
    app: {
      nodeEnv: env.NODE_ENV,
      appEnv: env.APP_ENV,
      port: env.PORT,
      corsOrigins,
      frontendUrl: corsOrigins[0] ?? trimTrailingSlash(env.FRONTEND_URL),
      publicApiUrl: trimTrailingSlash(env.PUBLIC_API_URL),
      internalServiceToken: env.INTERNAL_SERVICE_TOKEN,
    },
    jwt: {
      accessSecret: env.JWT_ACCESS_SECRET,
      refreshSecret: env.JWT_REFRESH_SECRET,
      accessTtl: env.JWT_ACCESS_TTL.trim(),
      refreshTtl: env.JWT_REFRESH_TTL.trim(),
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    },
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      callbackUrl: env.GOOGLE_CALLBACK_URL,
      enabled: env.GOOGLE_CLIENT_ID.length > 0 && env.GOOGLE_CLIENT_SECRET.length > 0,
    },
    database: {
      url: env.DATABASE_URL,
    },
    mongo: {
      uri: env.MONGO_URI,
    },
    redis: {
      url: env.REDIS_URL,
      defaultTtlSeconds: env.REDIS_TTL_DEFAULT,
    },
    storage: {
      region: env.AWS_REGION,
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      bucket: env.S3_BUCKET,
      publicBaseUrl: trimTrailingSlash(
        env.S3_PUBLIC_BASE_URL || (env.CLOUDFRONT_DOMAIN ? `https://${env.CLOUDFRONT_DOMAIN}` : ''),
      ),
      cloudfrontDomain: env.CLOUDFRONT_DOMAIN,
      enabled: env.AWS_ACCESS_KEY_ID.length > 0 && env.AWS_SECRET_ACCESS_KEY.length > 0,
    },
    services: {
      apiCore: trimTrailingSlash(env.API_CORE_URL),
      search: trimTrailingSlash(env.SEARCH_SVC_URL),
      rag: trimTrailingSlash(env.RAG_SVC_URL),
      reports: trimTrailingSlash(env.REPORTS_SVC_URL),
    },
  };
}

/** `ConfigModule.forRoot({ load: [configuration] })` factory. */
export default function configuration(): AppConfig {
  return buildConfig(getEnv());
}
