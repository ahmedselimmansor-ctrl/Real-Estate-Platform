import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCookieAuth,
  ApiExcludeEndpoint,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import type { User } from '@prisma/client';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { REFRESH_TOKEN_COOKIE } from '../../common/constants';
import { AppException } from '../../common/errors/app.exception';
import { ERROR_CODES } from '../../common/errors/error-codes';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AppConfigService } from '../../config/app-config.service';
import { AuthResult, AuthService, GoogleProfile, PublicUser } from './auth.service';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
} from './dto/auth.dto';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { LocalAuthGuard } from './guards/local-auth.guard';
import type { SessionContext } from './token.service';

/** Auth endpoints are the most attacked surface — throttle them hard. */
const STRICT_THROTTLE = { auth: { limit: 5, ttl: 60_000 } };

interface AuthResponseBody {
  user: PublicUser;
  accessToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfigService,
  ) {}

  // ------------------------------------------------------------------ public

  @Public()
  @Throttle(STRICT_THROTTLE)
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an account and start a session' })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseBody> {
    const result = await this.auth.register(dto, this.sessionContext(req));
    return this.respondWithSession(res, result);
  }

  @Public()
  @Throttle(STRICT_THROTTLE)
  @UseGuards(LocalAuthGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: LoginDto })
  @ApiOperation({ summary: 'Sign in with email and password' })
  async login(
    @Req() req: Request & { user: User },
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseBody> {
    const result = await this.auth.login(req.user, this.sessionContext(req));
    return this.respondWithSession(res, result);
  }

  @Public()
  @Throttle({ auth: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth(REFRESH_TOKEN_COOKIE)
  @ApiOperation({ summary: 'Rotate the refresh cookie for a new access token' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseBody> {
    const token = this.readRefreshCookie(req);

    if (!token) {
      throw AppException.unauthorized(
        'No refresh token was supplied',
        ERROR_CODES.REFRESH_TOKEN_MISSING,
      );
    }

    try {
      const result = await this.auth.refresh(token, this.sessionContext(req));
      return this.respondWithSession(res, result);
    } catch (error) {
      // A dead refresh token should not linger in the browser.
      this.clearRefreshCookie(res);
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke the current session' })
  async logout(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ loggedOut: true }> {
    await this.auth.logout(user, this.readRefreshCookie(req));
    this.clearRefreshCookie(res);
    return { loggedOut: true };
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'The currently authenticated user' })
  @ApiOkResponse({ description: 'The access token owner' })
  async me(@CurrentUser('id') userId: string): Promise<PublicUser> {
    return this.auth.me(userId);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change your password (revokes all sessions)' })
  async changePassword(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ changed: true }> {
    await this.auth.changePassword(userId, dto.currentPassword, dto.newPassword);
    this.clearRefreshCookie(res);
    return { changed: true };
  }

  // ---------------------------------------------------------- password reset

  @Public()
  @Throttle(STRICT_THROTTLE)
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request a password reset link',
    description:
      'Always returns 200 — revealing whether an address is registered would enable account enumeration.',
  })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<{ sent: true }> {
    await this.auth.forgotPassword(dto);
    return { sent: true };
  }

  @Public()
  @Throttle(STRICT_THROTTLE)
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Consume a reset token and set a new password' })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<{ reset: true }> {
    await this.auth.resetPassword(dto);
    return { reset: true };
  }

  // ----------------------------------------------------------- google oauth

  @Public()
  @UseGuards(GoogleAuthGuard)
  @Get('google')
  @ApiOperation({ summary: 'Redirect to Google for consent' })
  googleAuth(): void {
    // The guard performs the redirect; this body is never reached.
  }

  @Public()
  @UseGuards(GoogleAuthGuard)
  @Get('google/callback')
  @ApiExcludeEndpoint()
  async googleCallback(
    @Req() req: Request & { user: GoogleProfile },
    @Res() res: Response,
  ): Promise<void> {
    const frontend = this.config.app.frontendUrl;

    try {
      const result = await this.auth.validateGoogleUser(req.user, this.sessionContext(req));
      this.setRefreshCookie(res, result.tokens.refreshToken, result.tokens.refreshExpiresIn);

      // CONTRACT §5 — the access token travels in the fragment so it never
      // reaches a server log or the Referer header.
      const params = new URLSearchParams({
        accessToken: result.tokens.accessToken,
        expiresIn: String(result.tokens.expiresIn),
      });
      res.redirect(`${frontend}/auth/callback#${params.toString()}`);
    } catch (error) {
      const code = error instanceof AppException ? error.code : ERROR_CODES.OAUTH_FAILED;
      res.redirect(`${frontend}/login?error=${encodeURIComponent(code)}`);
    }
  }

  // ----------------------------------------------------------------- helpers

  private respondWithSession(res: Response, result: AuthResult): AuthResponseBody {
    this.setRefreshCookie(res, result.tokens.refreshToken, result.tokens.refreshExpiresIn);

    return {
      user: result.user,
      accessToken: result.tokens.accessToken,
      expiresIn: result.tokens.expiresIn,
      tokenType: 'Bearer',
    };
  }

  /** CONTRACT §5 — `httpOnly; Secure; SameSite=Lax`, scoped to the auth routes. */
  private cookieOptions(maxAgeSeconds?: number): CookieOptions {
    return {
      httpOnly: true,
      // Everything is served over TLS via nginx; keep it relaxed only when a
      // developer runs the API directly over plain HTTP.
      secure: !this.config.isDevelopment || this.config.app.frontendUrl.startsWith('https'),
      sameSite: 'lax',
      path: '/api/v1/auth',
      ...(maxAgeSeconds ? { maxAge: maxAgeSeconds * 1000 } : {}),
    };
  }

  private setRefreshCookie(res: Response, token: string, maxAgeSeconds: number): void {
    res.cookie(REFRESH_TOKEN_COOKIE, token, this.cookieOptions(maxAgeSeconds));
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie(REFRESH_TOKEN_COOKIE, this.cookieOptions());
  }

  private readRefreshCookie(req: Request): string | undefined {
    const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
    return cookies?.[REFRESH_TOKEN_COOKIE];
  }

  private sessionContext(req: Request): SessionContext {
    return {
      userAgent: req.get('user-agent') ?? null,
      ipAddress: req.ip ?? null,
    };
  }
}
