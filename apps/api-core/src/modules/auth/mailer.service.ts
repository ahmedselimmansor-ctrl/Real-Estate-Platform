import { Injectable, Logger } from '@nestjs/common';

import { AppConfigService } from '../../config/app-config.service';

export interface PasswordResetMail {
  to: string;
  name: string;
  resetUrl: string;
  expiresInMinutes: number;
}

export interface WelcomeMail {
  to: string;
  name: string;
}

/**
 * Transactional mail seam.
 *
 * No SMTP provider is wired up — sending is logged instead, which keeps the
 * stack runnable with zero third-party accounts. Swap this implementation for
 * SES/Postmark/Resend without touching any caller.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);

  constructor(private readonly config: AppConfigService) {}

  async sendPasswordReset(mail: PasswordResetMail): Promise<void> {
    this.logger.log(
      `[mail:password-reset] to=${mail.to} expires_in=${mail.expiresInMinutes}m url=${mail.resetUrl}`,
    );
  }

  async sendWelcome(mail: WelcomeMail): Promise<void> {
    this.logger.log(`[mail:welcome] to=${mail.to} name=${mail.name}`);
  }

  /** Builds the link the reset email points at. */
  resetUrl(token: string): string {
    return `${this.config.app.frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;
  }
}
