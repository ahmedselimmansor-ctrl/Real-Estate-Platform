"""Local JWT verification + service-token auth (CONTRACT §5).

Access tokens are minted by `api-core` (HS256, secret `JWT_ACCESS_SECRET`) and
verified here **locally** — no network round trip. Issuer and audience must match
`JWT_ISSUER` / `JWT_AUDIENCE`.

Claims (exact):
    {"sub", "email", "role", "name", "jti", "iss", "aud", "iat", "exp"}
"""

from __future__ import annotations

import secrets
from typing import Annotated, Any

import jwt
from fastapi import Depends, Security
from fastapi.security import APIKeyHeader, HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict, Field

from app.core.config import Settings, get_settings
from app.core.context import SERVICE_TOKEN_HEADER
from app.core.errors import ForbiddenError, UnauthorizedError
from app.core.logging import get_logger

log = get_logger("search-svc.security")

USER_ROLES: tuple[str, ...] = ("user", "agent", "admin", "superadmin")
PRIVILEGED_ROLES: tuple[str, ...] = ("admin", "superadmin")

bearer_scheme = HTTPBearer(
    auto_error=False,
    scheme_name="BearerAuth",
    description="api-core access token",
)
service_token_scheme = APIKeyHeader(
    name=SERVICE_TOKEN_HEADER,
    auto_error=False,
    scheme_name="ServiceToken",
    description="Internal service-to-service token (INTERNAL_SERVICE_TOKEN)",
)


class AuthenticatedUser(BaseModel):
    """Subject decoded from a verified access token."""

    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(validation_alias="sub", serialization_alias="id")
    email: str | None = None
    role: str = "user"
    name: str | None = None
    jti: str | None = None

    @property
    def is_admin(self) -> bool:
        return self.role in PRIVILEGED_ROLES

    @property
    def is_agent(self) -> bool:
        return self.role in ("agent", *PRIVILEGED_ROLES)


def decode_access_token(token: str, settings: Settings | None = None) -> dict[str, Any]:
    """Verify and decode an access token, raising `UnauthorizedError` on failure."""
    cfg = settings or get_settings()
    if not token or not token.strip():
        raise UnauthorizedError("Missing access token", code="TOKEN_MISSING")

    try:
        payload: dict[str, Any] = jwt.decode(
            token.strip(),
            cfg.JWT_ACCESS_SECRET,
            algorithms=[cfg.JWT_ALGORITHM],
            audience=cfg.JWT_AUDIENCE,
            issuer=cfg.JWT_ISSUER,
            leeway=cfg.JWT_LEEWAY_SECONDS,
            options={"require": ["exp", "sub", "iss", "aud"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise UnauthorizedError("Access token has expired", code="TOKEN_EXPIRED") from exc
    except jwt.InvalidAudienceError as exc:
        raise UnauthorizedError("Access token audience is invalid", code="INVALID_TOKEN") from exc
    except jwt.InvalidIssuerError as exc:
        raise UnauthorizedError("Access token issuer is invalid", code="INVALID_TOKEN") from exc
    except jwt.MissingRequiredClaimError as exc:
        raise UnauthorizedError("Access token is missing claims", code="INVALID_TOKEN") from exc
    except jwt.InvalidTokenError as exc:
        raise UnauthorizedError("Access token is invalid", code="INVALID_TOKEN") from exc

    if not payload.get("sub"):
        raise UnauthorizedError("Access token is missing the subject claim", code="INVALID_TOKEN")
    return payload


def user_from_payload(payload: dict[str, Any]) -> AuthenticatedUser:
    """Build the user model from verified claims."""
    role = str(payload.get("role") or "user")
    return AuthenticatedUser(
        sub=str(payload["sub"]),
        email=payload.get("email"),
        role=role if role in USER_ROLES else "user",
        name=payload.get("name"),
        jti=payload.get("jti"),
    )


async def current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Security(bearer_scheme)],
) -> AuthenticatedUser:
    """Require a valid access token."""
    if credentials is None or not credentials.credentials:
        raise UnauthorizedError("Authentication required", code="TOKEN_MISSING")
    if (credentials.scheme or "").lower() != "bearer":
        raise UnauthorizedError("Authorization scheme must be Bearer", code="INVALID_TOKEN")
    payload = decode_access_token(credentials.credentials, get_settings())
    return user_from_payload(payload)


async def optional_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Security(bearer_scheme)],
) -> AuthenticatedUser | None:
    """Return the caller when a valid token is present, otherwise `None`."""
    if credentials is None or not credentials.credentials:
        return None
    try:
        payload = decode_access_token(credentials.credentials, get_settings())
    except UnauthorizedError as exc:
        log.debug("optional_user_rejected", code=exc.code)
        return None
    return user_from_payload(payload)


def require_roles(*roles: str):
    """Dependency factory enforcing one of `roles` on the authenticated caller."""
    allowed = set(roles) or set(PRIVILEGED_ROLES)

    async def _dependency(
        user: Annotated[AuthenticatedUser, Depends(current_user)],
    ) -> AuthenticatedUser:
        if user.role not in allowed:
            raise ForbiddenError(
                f"Role '{user.role}' may not perform this action",
                code="INSUFFICIENT_ROLE",
            )
        return user

    return _dependency


require_admin = require_roles("admin", "superadmin")


async def require_service_token(
    token: Annotated[str | None, Security(service_token_scheme)],
) -> str:
    """Validate `X-Service-Token` for internal-only endpoints (CONTRACT §5)."""
    cfg = get_settings()
    expected = cfg.INTERNAL_SERVICE_TOKEN or ""

    if not expected:
        log.error("service_token_not_configured")
        raise ForbiddenError(
            "Internal service token is not configured",
            code="SERVICE_TOKEN_NOT_CONFIGURED",
        )
    if not token:
        raise UnauthorizedError(
            f"{SERVICE_TOKEN_HEADER} header is required",
            code="SERVICE_TOKEN_REQUIRED",
        )
    if not secrets.compare_digest(token.strip(), expected):
        log.warning("service_token_rejected")
        raise ForbiddenError("Invalid service token", code="INVALID_SERVICE_TOKEN")
    return token


CurrentUser = Annotated[AuthenticatedUser, Depends(current_user)]
OptionalUser = Annotated[AuthenticatedUser | None, Depends(optional_user)]
ServiceToken = Annotated[str, Depends(require_service_token)]
