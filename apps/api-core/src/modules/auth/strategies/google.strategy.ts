import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy, StrategyOptions, VerifyCallback } from 'passport-google-oauth20';

import { AppConfigService } from '../../../config/app-config.service';
import type { GoogleProfile } from '../auth.service';

/**
 * Google OAuth 2.0 (CONTRACT §5).
 *
 * Only registered when `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are present —
 * see `AuthModule`. The routes themselves stay mounted and answer 503
 * `OAUTH_NOT_CONFIGURED` when the strategy is absent, so the frontend can render
 * a disabled button instead of a broken link.
 */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: AppConfigService) {
    super({
      clientID: config.google.clientId,
      clientSecret: config.google.clientSecret,
      callbackURL: config.google.callbackUrl,
      scope: ['email', 'profile'],
      state: true,
    } satisfies StrategyOptions);
  }

  validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): void {
    const email = profile.emails?.[0]?.value;

    if (!email) {
      done(new Error('Google account did not return an email address'));
      return;
    }

    const mapped: GoogleProfile = {
      providerAccountId: profile.id,
      email: email.trim().toLowerCase(),
      name: profile.displayName || email.split('@')[0],
      avatarUrl: profile.photos?.[0]?.value ?? null,
      accessToken,
      refreshToken,
    };

    // Passport types the principal as `Express.User`; ours is the mapped Google
    // profile, which `AuthController.googleCallback` consumes directly.
    done(null, mapped as unknown as Express.User);
  }
}
