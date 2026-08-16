import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { REFRESH_TOKEN_COOKIE, SERVICE_VERSION, SERVICE_TOKEN_HEADER, SWAGGER_PATH } from './common/constants';

/** OpenAPI docs served at `/api/v1/docs` (CONTRACT §1 prefix). */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Nawy Clone — api-core')
    .setDescription(
      [
        'Core API for the Nawy clone: authentication, users, developers, compounds,',
        'areas, properties (write side), favorites, leads, uploads and admin.',
        '',
        'Every response follows the shared envelope:',
        '`{ "success": true, "data": …, "meta": { … } }` or',
        '`{ "success": false, "error": { "code": "…", "message": "…", "details": [] } }`.',
        '',
        'Send `X-Request-Id` to correlate logs across services.',
      ].join('\n'),
    )
    .setVersion(SERVICE_VERSION)
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        in: 'header',
        description: 'Access token issued by POST /auth/login (HS256, 15m).',
      },
      'access-token',
    )
    .addCookieAuth(
      REFRESH_TOKEN_COOKIE,
      { type: 'apiKey', in: 'cookie', name: REFRESH_TOKEN_COOKIE },
      'refresh-token',
    )
    .addApiKey(
      { type: 'apiKey', name: SERVICE_TOKEN_HEADER, in: 'header' },
      'service-token',
    )
    .addTag('health', 'Liveness and readiness probes')
    .addTag('auth', 'Registration, login, refresh, OAuth')
    .addTag('properties', 'Listing read/write endpoints')
    .addTag('compounds', 'Compound catalogue')
    .addTag('developers', 'Developer catalogue')
    .addTag('areas', 'Area catalogue')
    .addTag('amenities', 'Amenity catalogue')
    .addTag('favorites', 'User favorites')
    .addTag('saved-searches', 'Stored search criteria')
    .addTag('leads', 'Sales leads')
    .addTag('users', 'Profile and user administration')
    .addTag('uploads', 'S3 presigned uploads')
    .addTag('admin', 'Dashboard KPIs and activity feed')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup(SWAGGER_PATH, app, document, {
    customSiteTitle: 'Nawy Clone — api-core',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      docExpansion: 'none',
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });
}
