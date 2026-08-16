import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import type { User } from '@prisma/client';
import { Strategy } from 'passport-local';

import { AuthService } from '../auth.service';

/** Email + password sign-in. Field is `email`, not the passport default `username`. */
@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy, 'local') {
  constructor(private readonly auth: AuthService) {
    super({ usernameField: 'email', passwordField: 'password', session: false });
  }

  async validate(email: string, password: string): Promise<User> {
    return this.auth.validateCredentials({
      email: email.trim().toLowerCase(),
      password,
    });
  }
}
