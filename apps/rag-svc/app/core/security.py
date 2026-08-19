"""JWT verification and service-to-service auth (CONTRACT §5).

Access tokens are issued by api-core: HS256 over ``JWT_ACCESS_SECRET`` with
``iss=topchoice-api`` and ``aud=topchoice-clients``. rag-svc verifies them **locally** —
never over the network — exactly like search-svc and reports-svc.

Guests are first-class in the chatbot, so :func:`optional_user` returns ``None``
when no ``Authorization`` header is present. A header that *is* present but
invalid is rejected with 401 so broken clients fail loudly.
"""

from __future__ import annotations

import secrets
from typing import Annotated, Any, Literal

# PyJWT rather than python-jose: python-jose is unmaintained, and its
# `[cryptography]` extra drags in `ecdsa`, which has an advisory with no fix.
# The surface used here is a single decode plus two exception types.
import jwt
from fastapi import Depends, Header, Request
from jwt import ExpiredSignatureError, PyJWTError
from pydantic import BaseModel, Field

from app.core.config import Settings, get_settings
from app.core.errors import ForbiddenError, UnauthorizedError
from app.core.logging import get_logger

logger = get_logger("rag-svc.security")

UserRole = Literal["user", "agent", "admin", "superadmin"]


class AuthUser(BaseModel):
    """The subset of the access-token claims the service cares about."""

    id: str = Field(description="`sub` claim — user uuid")
    email: str | None = None
    role: UserRole = "user"
    name: str | None = None
    jti: str | None = None

    @property
    def is_staff(self) -> bool:
        return self.role in ("admin", "superadmin", "agent")


def decode_access_token(token: str, settings: Settings | None = None) -> AuthUser:
    """Verify an access token and map it onto :class:`AuthUser`.

    Raises :class:`UnauthorizedError` for any invalid/expired/foreign token.
    """
    cfg = settings or get_settings()
    if not cfg.jwt_access_secret:
        raise UnauthorizedError("Token verification is not configured", code="AUTH_NOT_CONFIGURED")

    try:
        claims: dict[str, Any] = jwt.decode(
            token,
            cfg.jwt_access_secret,
            algorithms=["HS256"],
            issuer=cfg.jwt_issuer,
            audience=cfg.jwt_audience,
            options={"verify_aud": True, "verify_iss": True},
        )
    except ExpiredSignatureError as exc:
        raise UnauthorizedError("Access token has expired", code="TOKEN_EXPIRED") from exc
    except PyJWTError as exc:
        raise UnauthorizedError("Invalid access token", code="INVALID_TOKEN") from exc

    subject = claims.get("sub")
    if not subject:
        raise UnauthorizedError("Access token is missing the sub claim", code="INVALID_TOKEN")

    role = claims.get("role", "user")
    if role not in ("user", "agent", "admin", "superadmin"):
        role = "user"

    return AuthUser(
        id=str(subject),
        email=claims.get("email"),
        role=role,
        name=claims.get("name"),
        jti=claims.get("jti"),
    )


def _bearer_token(request: Request) -> str | None:
    header = request.headers.get("authorization") or request.headers.get("Authorization")
    if not header:
        return None
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    return token.strip()


async def optional_user(request: Request) -> AuthUser | None:
    """Resolve the caller when a token is supplied; ``None`` for guests."""
    token = _bearer_token(request)
    if token is None:
        return None
    user = decode_access_token(token)
    request.state.user = user
    return user


async def require_user(
    user: Annotated[AuthUser | None, Depends(optional_user)],
) -> AuthUser:
    """Require an authenticated end user."""
    if user is None:
        raise UnauthorizedError("Authentication is required")
    return user


def require_roles(*roles: UserRole):
    """Dependency factory enforcing one of ``roles``."""

    async def _dependency(user: Annotated[AuthUser, Depends(require_user)]) -> AuthUser:
        if user.role not in roles:
            raise ForbiddenError(f"Requires one of roles: {', '.join(roles)}")
        return user

    return _dependency


async def require_service_token(
    x_service_token: Annotated[str | None, Header(alias="X-Service-Token")] = None,
) -> None:
    """Guard internal-only endpoints with ``X-Service-Token`` (CONTRACT §5)."""
    settings = get_settings()
    expected = settings.internal_service_token
    if not expected:
        logger.error("service_token_not_configured")
        raise UnauthorizedError(
            "Service-to-service authentication is not configured",
            code="SERVICE_TOKEN_NOT_CONFIGURED",
        )
    if not x_service_token or not secrets.compare_digest(x_service_token, expected):
        raise UnauthorizedError("Invalid service token", code="INVALID_SERVICE_TOKEN")


CurrentUser = Annotated[AuthUser, Depends(require_user)]
OptionalUser = Annotated[AuthUser | None, Depends(optional_user)]
ServiceToken = Annotated[None, Depends(require_service_token)]
