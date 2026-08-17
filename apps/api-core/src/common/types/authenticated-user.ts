import { UserRoleValue } from '../enums';

/**
 * CONTRACT §5 — access token claims (exact shape, verified by every service).
 * ```json
 * { "sub": "<userId uuid>", "email": "a@b.com", "role": "user", "name": "Ahmed",
 *   "jti": "<uuid>", "iss": "topchoice-api", "aud": "topchoice-clients", "iat": 0, "exp": 0 }
 * ```
 */
export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: UserRoleValue;
  name: string;
  jti: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}

/** Refresh token claims — rotated on use, `jti` tracked in Redis. */
export interface RefreshTokenPayload {
  sub: string;
  jti: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}

/** The principal attached to `request.user` once a guard has run. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: UserRoleValue;
  /** `jti` of the access token that authenticated this request. */
  jti: string;
}

export const authenticatedUserFromPayload = (payload: AccessTokenPayload): AuthenticatedUser => ({
  id: payload.sub,
  email: payload.email,
  name: payload.name,
  role: payload.role,
  jti: payload.jti,
});
