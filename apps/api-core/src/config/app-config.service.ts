import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  AppConfig,
  AppRuntimeConfig,
  DatabaseConfig,
  GoogleOAuthConfig,
  JwtConfig,
  MongoConfig,
  RedisConfig,
  ServiceUrlsConfig,
  StorageConfig,
} from './configuration';

/**
 * Strongly typed accessor over the validated configuration tree.
 * Feature modules must depend on this instead of reading `process.env`.
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  get app(): AppRuntimeConfig {
    return this.config.get('app', { infer: true });
  }

  get jwt(): JwtConfig {
    return this.config.get('jwt', { infer: true });
  }

  get google(): GoogleOAuthConfig {
    return this.config.get('google', { infer: true });
  }

  get database(): DatabaseConfig {
    return this.config.get('database', { infer: true });
  }

  get mongo(): MongoConfig {
    return this.config.get('mongo', { infer: true });
  }

  get redis(): RedisConfig {
    return this.config.get('redis', { infer: true });
  }

  get storage(): StorageConfig {
    return this.config.get('storage', { infer: true });
  }

  get services(): ServiceUrlsConfig {
    return this.config.get('services', { infer: true });
  }

  get isProduction(): boolean {
    return this.app.nodeEnv === 'production';
  }

  get isDevelopment(): boolean {
    return this.app.nodeEnv === 'development';
  }

  get isTest(): boolean {
    return this.app.nodeEnv === 'test';
  }
}
