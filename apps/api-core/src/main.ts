import { RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger as PinoLogger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { API_PREFIX, SERVICE_NAME, SERVICE_VERSION, SWAGGER_PATH } from './common/constants';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';
import { createValidationPipe } from './common/pipes/validation-pipe.factory';
import { AppConfigService } from './config/app-config.service';
import { setupSwagger } from './swagger';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    // CORS is configured explicitly below, from FRONTEND_URL.
    cors: false,
  });

  // Structured JSON logging with the X-Request-Id correlation id (CONTRACT §10.6).
  app.useLogger(app.get(PinoLogger));
  app.flushLogs();

  const config = app.get(AppConfigService);
  const logger = app.get(PinoLogger);

  // Behind nginx — trust the first proxy so req.ip / secure cookies behave.
  app.set('trust proxy', 1);

  // CONTRACT §4 — read/propagate X-Request-Id before anything else runs.
  app.use(requestIdMiddleware);

  app.use(
    helmet({
      // Swagger UI ships inline scripts/styles; TLS + HSTS terminate at nginx.
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'script-src': ["'self'", "'unsafe-inline'"],
          'style-src': ["'self'", "'unsafe-inline'"],
          'img-src': ["'self'", 'data:', 'https:'],
          'upgrade-insecure-requests': null,
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(compression());
  app.use(cookieParser());

  app.enableCors({
    origin: config.app.corsOrigins,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-Id',
      'X-Service-Token',
      'Accept-Language',
    ],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 86_400,
  });

  // CONTRACT §1 — everything lives under /api/v1 except the health probes.
  app.setGlobalPrefix(API_PREFIX, {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
  });

  app.useGlobalPipes(createValidationPipe());
  // CONTRACT §4 envelopes: interceptor wraps success, filter renders errors.
  app.useGlobalInterceptors(app.get(LoggingInterceptor), app.get(TransformInterceptor));
  app.useGlobalFilters(app.get(HttpExceptionFilter));

  setupSwagger(app);

  // Drain Prisma/Mongo/Redis on SIGTERM (docker compose down, rolling deploys).
  app.enableShutdownHooks();

  const port = config.app.port;
  await app.listen(port, '0.0.0.0');

  logger.log(
    `${SERVICE_NAME} v${SERVICE_VERSION} [${config.app.appEnv}] listening on http://0.0.0.0:${port}` +
      ` — api: /${API_PREFIX}, docs: /${SWAGGER_PATH}, health: /health`,
  );
}

void bootstrap();
