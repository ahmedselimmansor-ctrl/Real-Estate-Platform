import { Global, Module } from '@nestjs/common';

import { HttpExceptionFilter } from './filters/http-exception.filter';
import { LoggingInterceptor } from './interceptors/logging.interceptor';
import { TransformInterceptor } from './interceptors/transform.interceptor';

/**
 * Cross-cutting HTTP plumbing. The filter and interceptors are instantiated by
 * Nest (so they get their dependencies) and registered globally in `main.ts`.
 */
@Global()
@Module({
  providers: [HttpExceptionFilter, TransformInterceptor, LoggingInterceptor],
  exports: [HttpExceptionFilter, TransformInterceptor, LoggingInterceptor],
})
export class CommonModule {}
