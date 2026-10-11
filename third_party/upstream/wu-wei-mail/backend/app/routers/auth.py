"""Auth routes - register, login, refresh (cookie-based), logout, me."""

import hashlib
import logging
import time

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models.user import User
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse, UserResponse
from app.services.auth_service import auth_service
from app.utils.redis_client import get_redis
from app.utils.security import REFRESH_TOKEN_EXPIRE_DAYS, get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()

# Rate limiting: Redis first, with in-memory fallback for degraded mode
_login_attempts: dict[str, list[float]] = {}
MAX_LOGIN_ATTEMPTS = 10
LOGIN_WINDOW_SECONDS = 300  # 5 minutes


def _rate_limit_storage_key(key: str) -> str:
    window_bucket = int(time.time()) // LOGIN_WINDOW_SECONDS
    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()[:20]
    return f"wuweimail:auth:login:{digest}:{window_bucket}"


def _increment_rate_limit_counter_redis(key: str) -> int:
    redis_key = _rate_limit_storage_key(key)
    redis_client = get_redis()
    count = int(redis_client.incr(redis_key))
    if count == 1:
        redis_client.expire(redis_key, LOGIN_WINDOW_SECONDS + 5)
    return count


def _increment_rate_limit_counter_memory(key: str) -> int:
    now = time.time()
    attempts = _login_attempts.get(key, [])
    attempts = [t for t in attempts if now - t < LOGIN_WINDOW_SECONDS]
    attempts.append(now)
    _login_attempts[key] = attempts
    return len(attempts)


def _increment_rate_limit_counter(key: str) -> int:
    try:
        return _increment_rate_limit_counter_redis(key)
    except Exception as exc:
        logger.warning("Rate limit Redis unavailable, using local fallback: %s", str(exc))
        return _increment_rate_limit_counter_memory(key)


def _check_rate_limit(key: str) -> None:
    """Check login rate limit. Raises HTTPException if exceeded."""
    attempts = _increment_rate_limit_counter(key)
    if attempts > MAX_LOGIN_ATTEMPTS:
        raise HTTPException(
            status_code=429,
            detail=f"Too many login attempts. Try again in {LOGIN_WINDOW_SECONDS // 60} minutes.",
        )


def _set_refresh_cookie(response: Response, refresh_token: str) -> None:
    """Set refresh token as HTTP-only secure cookie."""
    settings = get_settings()
    is_secure = not settings.DEBUG  # Only secure in production (HTTPS)
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=is_secure,
        samesite="lax",
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/api/auth",  # Scoped to auth endpoints only
    )


def _clear_refresh_cookie(response: Response) -> None:
    """Clear the refresh token cookie."""
    response.delete_cookie(
        key="refresh_token",
        path="/api/auth",
    )


@router.post("/register", response_model=TokenResponse)
async def register(req: RegisterRequest, response: Response, db: AsyncSession = Depends(get_db)):
    try:
        user, access_token, refresh_token = await auth_service.register(
            db, req.email, req.password, req.full_name, req.workspace_name,
        )
        _set_refresh_cookie(response, refresh_token)
        return TokenResponse(
            access_token=access_token,
            user_id=user.id,
            workspace_id=user.workspace_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/login", response_model=TokenResponse)
async def login(
    req: LoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    # Rate limit by IP + email
    client_ip = request.client.host if request.client else "unknown"
    _check_rate_limit(f"ip:{client_ip}")
    _check_rate_limit(f"email:{req.email.lower()}")

    try:
        user, access_token, refresh_token = await auth_service.login(db, req.email, req.password)
        _set_refresh_cookie(response, refresh_token)
        return TokenResponse(
            access_token=access_token,
            user_id=user.id,
            workspace_id=user.workspace_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    response: Response,
    db: AsyncSession = Depends(get_db),
    refresh_token: str | None = Cookie(None),
):
    """Refresh access token using HTTP-only cookie.

    Reads refresh_token from HTTP-only cookie, validates it,
    rotates to a new token, and returns a fresh access token.
    """
    if not refresh_token:
        raise HTTPException(
            status_code=401,
            detail="No refresh token found. Please log in again.",
        )

    try:
        user, access_token, new_refresh = await auth_service.refresh(db, refresh_token)
        _set_refresh_cookie(response, new_refresh)
        return TokenResponse(
            access_token=access_token,
            user_id=user.id,
            workspace_id=user.workspace_id,
        )
    except ValueError as e:
        _clear_refresh_cookie(response)
        raise HTTPException(status_code=401, detail=str(e))


@router.post("/logout")
async def logout(
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Logout - revoke all refresh tokens and clear cookie."""
    await auth_service.logout(db, current_user.id)
    _clear_refresh_cookie(response)
    return {"status": "ok"}


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user
