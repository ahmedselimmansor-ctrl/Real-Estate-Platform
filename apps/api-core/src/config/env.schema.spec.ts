import { buildConfig } from './configuration';
import { EnvValidationError, resetEnvCache, validateEnv } from './env.schema';

const validEnv = {
  NODE_ENV: 'test',
  APP_ENV: 'test',
  PORT: '4000',
  FRONTEND_URL: 'https://localhost',
  PUBLIC_API_URL: 'https://localhost/api/v1',
  INTERNAL_SERVICE_TOKEN: 'change-me-internal-token',
  JWT_ACCESS_SECRET: 'change-me-access-secret-min-32-chars-long-0000',
  JWT_REFRESH_SECRET: 'change-me-refresh-secret-min-32-chars-long-000',
  DATABASE_URL: 'postgresql://topchoice:topchoice_password@postgres:5432/topchoice?schema=public',
  MONGO_URI: 'mongodb://mongo:27017/topchoice',
  REDIS_URL: 'redis://redis:6379',
};

describe('validateEnv', () => {
  beforeEach(() => resetEnvCache());

  it('accepts the documented .env.example values and applies contract defaults', () => {
    const env = validateEnv(validEnv);

    expect(env.PORT).toBe(4000);
    expect(env.JWT_ACCESS_TTL).toBe('15m');
    expect(env.JWT_REFRESH_TTL).toBe('30d');
    expect(env.JWT_ISSUER).toBe('topchoice-api');
    expect(env.JWT_AUDIENCE).toBe('topchoice-clients');
    expect(env.REDIS_TTL_DEFAULT).toBe(300);
    expect(env.SEARCH_SVC_URL).toBe('http://search-svc:8000');
  });

  it('lists every missing variable in one readable error', () => {
    expect.assertions(4);

    try {
      validateEnv({ NODE_ENV: 'development' });
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      const message = (error as EnvValidationError).message;
      expect(message).toContain('FRONTEND_URL');
      expect(message).toContain('DATABASE_URL');
      expect(message).toContain('JWT_ACCESS_SECRET');
    }
  });

  it('rejects short JWT secrets and malformed connection strings', () => {
    expect(() => validateEnv({ ...validEnv, JWT_ACCESS_SECRET: 'too-short' })).toThrow(
      EnvValidationError,
    );
    expect(() => validateEnv({ ...validEnv, DATABASE_URL: 'mysql://topchoice@db/topchoice' })).toThrow(
      EnvValidationError,
    );
    expect(() => validateEnv({ ...validEnv, MONGO_URI: 'http://mongo:27017' })).toThrow(
      EnvValidationError,
    );
  });
});

describe('buildConfig', () => {
  beforeEach(() => resetEnvCache());

  it('splits FRONTEND_URL into a CORS allow-list', () => {
    const config = buildConfig(
      validateEnv({ ...validEnv, FRONTEND_URL: 'https://localhost, https://topchoice.local/' }),
    );

    expect(config.app.corsOrigins).toEqual(['https://localhost', 'https://topchoice.local']);
    expect(config.app.frontendUrl).toBe('https://localhost');
  });

  it('disables Google OAuth and S3 when credentials are blank', () => {
    const config = buildConfig(validateEnv(validEnv));

    expect(config.google.enabled).toBe(false);
    expect(config.storage.enabled).toBe(false);
    expect(config.storage.bucket).toBe('topchoice-media');
  });

  it('enables Google OAuth once both credentials are present', () => {
    const config = buildConfig(
      validateEnv({ ...validEnv, GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' }),
    );

    expect(config.google.enabled).toBe(true);
    expect(config.google.callbackUrl).toBe('https://localhost/api/v1/auth/google/callback');
  });
});
