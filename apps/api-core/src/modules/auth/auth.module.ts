import { Global, Module, Provider } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { AppConfigModule } from '../../config/config.module';
import { AppConfigService } from '../../config/app-config.service';
import { AuthCleanupService } from './auth.cleanup.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { MailerService } from './mailer.service';
import { GoogleStrategy } from './strategies/google.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { TokenService } from './token.service';

/**
 * Registered only when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set.
 * Instantiating `passport-google-oauth20` without them throws at construction,
 * which would take the whole API down in a keyless dev environment.
 */
const googleStrategyProvider: Provider = {
  provide: GoogleStrategy,
  inject: [AppConfigService],
  useFactory: (config: AppConfigService): GoogleStrategy | null =>
    config.google.enabled ? new GoogleStrategy(config) : null,
};

/**
 * CONTRACT §5. Global because `TokenService` and the guards are consumed by
 * every other feature module.
 */
@Global()
@Module({
  imports: [
    AppConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt', session: false }),
    JwtModule.registerAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        // Per-call `secret` overrides distinguish access from refresh tokens;
        // this default only fixes the algorithm.
        secret: config.jwt.accessSecret,
        signOptions: { algorithm: 'HS256' },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    MailerService,
    AuthCleanupService,
    JwtStrategy,
    LocalStrategy,
    googleStrategyProvider,
    GoogleAuthGuard,

    // CONTRACT §5 — authentication is on by default; `@Public()` opts out.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Runs after the JWT guard so `request.user` is populated.
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthService, TokenService, MailerService],
})
export class AuthModule {}
