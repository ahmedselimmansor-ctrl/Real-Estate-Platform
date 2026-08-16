import { ExecutionContext, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { Request } from 'express';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { LoggerModule } from 'nestjs-pino';
import { v4 as uuidv4 } from 'uuid';

import { CommonModule } from './common/common.module';
import {
  GLOBAL_RATE_LIMIT,
  GLOBAL_RATE_LIMIT_TTL_MS,
  REQUEST_ID_HEADER,
  SERVICE_NAME,
} from './common/constants';
import { AppConfigModule } from './config/config.module';
import { AppConfigService } from './config/app-config.service';
import { HealthModule } from './health/health.module';
import { MongoModule } from './mongo/mongo.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';

import { AdminModule } from './modules/admin/admin.module';
import { AmenitiesModule } from './modules/amenities/amenities.module';
import { AreasModule } from './modules/areas/areas.module';
import { AuthModule } from './modules/auth/auth.module';
import { CompoundsModule } from './modules/compounds/compounds.module';
import { DevelopersModule } from './modules/developers/developers.module';
import { FavoritesModule } from './modules/favorites/favorites.module';
import { LeadsModule } from './modules/leads/leads.module';
import { PropertiesModule } from './modules/properties/properties.module';
import { SavedSearchesModule } from './modules/saved-searches/saved-searches.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { UsersModule } from './modules/users/users.module';

const isHealthProbe = (url: string | undefined): boolean =>
  typeof url === 'string' && (url === '/health' || url.startsWith('/health/'));

@Module({
  imports: [
    // ---- configuration (zod-validated, fails fast) --------------------------
    AppConfigModule,

    // ---- structured logging (CONTRACT §10.6) --------------------------------
    LoggerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        pinoHttp: {
          name: SERVICE_NAME,
          level: config.isProduction ? 'info' : 'debug',
          genReqId: (req: IncomingMessage, _res: ServerResponse): string => {
            const header = req.headers[REQUEST_ID_HEADER];
            const value = Array.isArray(header) ? header[0] : header;
            return typeof value === 'string' && value.length > 0 ? value : uuidv4();
          },
          // `req.id` is set by `requestIdMiddleware` / `genReqId` above.
          customProps: (req: IncomingMessage) => ({
            service: SERVICE_NAME,
            requestId: req.id,
          }),
          autoLogging: {
            ignore: (req: IncomingMessage) => isHealthProbe(req.url),
          },
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.headers["x-service-token"]',
              'res.headers["set-cookie"]',
              'req.body.password',
              'req.body.currentPassword',
              'req.body.newPassword',
              'req.body.token',
            ],
            censor: '[redacted]',
          },
          transport: config.isProduction
            ? undefined
            : {
                target: 'pino-pretty',
                options: {
                  singleLine: true,
                  colorize: true,
                  translateTime: 'SYS:HH:MM:ss.l',
                  ignore: 'pid,hostname',
                },
              },
        },
      }),
    }),

    // ---- global rate limiting: 120 req/min (feature modules tighten it) -----
    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'default', ttl: GLOBAL_RATE_LIMIT_TTL_MS, limit: GLOBAL_RATE_LIMIT },
      ],
      errorMessage: 'Too many requests, slow down',
      skipIf: (context: ExecutionContext) => {
        if (context.getType() !== 'http') {
          return false;
        }
        const request = context.switchToHttp().getRequest<Request>();
        return isHealthProbe(request.originalUrl ?? request.url);
      },
    }),

    // ---- cron / interval jobs (digests, cache warmers) ----------------------
    ScheduleModule.forRoot(),

    // ---- persistence --------------------------------------------------------
    PrismaModule,
    MongoModule,
    RedisModule,

    // ---- cross-cutting HTTP plumbing ---------------------------------------
    CommonModule,

    // ---- probes -------------------------------------------------------------
    HealthModule,

    // ---- feature modules (CONTRACT §6) --------------------------------------
    // AuthModule is @Global and registers the JWT + roles APP_GUARDs, so it must
    // come first: every module below is protected by default and opts out with
    // `@Public()`.
    AuthModule, //          /auth/*           JWT, refresh rotation, Google OAuth
    UsersModule, //         /users/*
    DevelopersModule, //    /developers/*
    AreasModule, //         /areas/*
    AmenitiesModule, //     /amenities
    CompoundsModule, //     /compounds/*
    PropertiesModule, //    /properties/*     MongoDB + relational mirror
    FavoritesModule, //     /favorites/*
    SavedSearchesModule, // /saved-searches/*
    LeadsModule, //         /leads/*
    UploadsModule, //       /uploads/*        S3 presign, local-disk fallback
    AdminModule, //         /admin/*          KPIs and audit trail
  ],
  providers: [
    // CONTRACT §10.4 — rate limiting is on by default everywhere.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
