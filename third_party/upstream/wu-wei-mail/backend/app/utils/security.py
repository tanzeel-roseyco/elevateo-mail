"""Password hashing, JWT token management, and refresh token utilities."""

import hashlib
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import UUID
from typing import Optional

import jwt
from jwt.exceptions import InvalidTokenError
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import get_settings
from app.database import get_db

settings = get_settings()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

# Refresh token settings
REFRESH_TOKEN_EXPIRE_DAYS = 30
MIN_PASSWORD_LENGTH = 8


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def validate_password(password: str) -> None:
    """Enforce password policy."""
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters")
    if password.isdigit():
        raise ValueError("Password cannot be all digits")
    if password.isalpha():
        raise ValueError("Password must contain at least one number or special character")


def normalize_email(email: str) -> str:
    """Normalize email: lowercase, strip whitespace."""
    return email.strip().lower()


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=settings.JWT_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


def generate_refresh_token() -> str:
    """Generate a cryptographically secure refresh token."""
    return secrets.token_urlsafe(48)


def hash_refresh_token(token: str) -> str:
    """Hash a refresh token for storage."""
    return hashlib.sha256(token.encode()).hexdigest()


async def create_refresh_token_record(db: AsyncSession, user_id: UUID) -> str:
    """Create a new refresh token record and return the raw token."""
    from app.models.refresh_token import RefreshToken

    raw_token = generate_refresh_token()
    token_hash = hash_refresh_token(raw_token)
    expires_at = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)

    record = RefreshToken(
        user_id=user_id,
        token_hash=token_hash,
        expires_at=expires_at,
    )
    db.add(record)
    await db.flush()
    return raw_token


async def rotate_refresh_token(db: AsyncSession, old_token: str) -> tuple:
    """Validate and rotate a refresh token. Returns (user_id, new_raw_token).

    Revokes the old token and creates a new one. Detects token reuse
    (if old token was already revoked) and revokes entire family.
    """
    from app.models.refresh_token import RefreshToken

    old_hash = hash_refresh_token(old_token)

    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == old_hash)
    )
    record = result.scalar_one_or_none()

    if not record:
        raise ValueError("Invalid refresh token")

    if record.revoked:
        # Token reuse detected — revoke all tokens for this user (breach response)
        from sqlalchemy import update as sa_update
        await db.execute(
            sa_update(RefreshToken)
            .where(RefreshToken.user_id == record.user_id)
            .values(revoked=True)
        )
        await db.flush()
        raise ValueError("Token reuse detected — all sessions revoked")

    if record.expires_at < datetime.now(timezone.utc):
        record.revoked = True
        await db.flush()
        raise ValueError("Refresh token expired")

    # Revoke old token
    record.revoked = True

    # Create new token
    new_raw = generate_refresh_token()
    new_hash = hash_refresh_token(new_raw)
    record.replaced_by = new_hash

    new_record = RefreshToken(
        user_id=record.user_id,
        token_hash=new_hash,
        expires_at=datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
    )
    db.add(new_record)
    await db.flush()

    return record.user_id, new_raw


async def revoke_user_refresh_tokens(db: AsyncSession, user_id: UUID) -> None:
    """Revoke all refresh tokens for a user (logout all sessions)."""
    from app.models.refresh_token import RefreshToken
    from sqlalchemy import update as sa_update

    await db.execute(
        sa_update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked == False)  # noqa: E712
        .values(revoked=True)
    )
    await db.flush()


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
):
    """Dependency: extract and return the current user from JWT."""
    from app.models.user import User

    payload = decode_access_token(token)
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    result = await db.execute(select(User).where(User.id == UUID(user_id)))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user


@dataclass(frozen=True)
class AuthPrincipal:
    """Authenticated human user or workspace API token."""

    kind: str
    workspace_id: UUID
    scopes: tuple[str, ...]
    user_id: UUID | None = None
    token_id: UUID | None = None
    role: str | None = None

    def has_scope(self, scope: str) -> bool:
        return "*" in self.scopes or "full_access" in self.scopes or scope in self.scopes


async def get_current_principal(
    request: Request,
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> AuthPrincipal:
    """Accept either a normal JWT user or a workspace API token."""
    if token.startswith("wwm_"):
        from app.services.api_token_service import api_token_service

        client_ip = request.client.host if request.client else None
        api_token = await api_token_service.authenticate_token(
            db,
            raw_token=token,
            ip_address=client_ip,
        )
        if not api_token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired API token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return AuthPrincipal(
            kind="api_token",
            workspace_id=api_token.workspace_id,
            token_id=api_token.id,
            scopes=tuple(api_token.scopes or ()),
        )

    user = await get_current_user(token=token, db=db)
    return AuthPrincipal(
        kind="user",
        workspace_id=user.workspace_id,
        user_id=user.id,
        role=user.role,
        scopes=("*",),
    )


def require_scope(scope: str):
    async def dependency(
        principal: AuthPrincipal = Depends(get_current_principal),
    ) -> AuthPrincipal:
        if not principal.has_scope(scope):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"API token missing required scope: {scope}",
            )
        return principal

    return dependency
