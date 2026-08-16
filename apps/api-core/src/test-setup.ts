/**
 * Jest bootstrap — provides the minimum CONTRACT §7 environment so modules that
 * validate configuration at import time can be unit tested.
 */
process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.APP_ENV = process.env.APP_ENV ?? 'test';
process.env.PORT = process.env.PORT ?? '4000';
process.env.FRONTEND_URL = process.env.FRONTEND_URL ?? 'https://localhost';
process.env.PUBLIC_API_URL = process.env.PUBLIC_API_URL ?? 'https://localhost/api/v1';
process.env.INTERNAL_SERVICE_TOKEN =
  process.env.INTERNAL_SERVICE_TOKEN ?? 'test-internal-service-token';
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET ?? 'test-access-secret-min-32-chars-long-000000';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ?? 'test-refresh-secret-min-32-chars-long-00000';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://nawy:nawy_password@localhost:5432/nawy?schema=public';
process.env.MONGO_URI = process.env.MONGO_URI ?? 'mongodb://localhost:27017/nawy';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
