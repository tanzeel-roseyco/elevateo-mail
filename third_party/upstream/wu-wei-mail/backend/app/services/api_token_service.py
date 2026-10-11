"""Workspace API token lifecycle and verification."""

import hashlib
import hmac
import secrets
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.api_token import WorkspaceApiToken


TOKEN_PREFIX = "wwm_live"


def hash_api_token(raw_token: str) -> str:
    settings = get_settings()
    return hmac.new(
        settings.JWT_SECRET.encode("utf-8"),
        raw_token.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


class ApiTokenService:
    def _generate_raw_token(self) -> tuple[str, str]:
        prefix_suffix = secrets.token_hex(4)
        token_prefix = f"{TOKEN_PREFIX}_{prefix_suffix}"
        secret = secrets.token_urlsafe(32)
        return token_prefix, f"{token_prefix}_{secret}"

    async def list_tokens(self, db: AsyncSession, workspace_id: UUID) -> list[WorkspaceApiToken]:
        result = await db.execute(
            select(WorkspaceApiToken)
            .where(WorkspaceApiToken.workspace_id == workspace_id)
            .order_by(WorkspaceApiToken.created_at.desc())
        )
        return list(result.scalars().all())

    async def create_token(
        self,
        db: AsyncSession,
        *,
        workspace_id: UUID,
        created_by_user_id: UUID,
        name: str,
        scopes: list[str],
        expires_at: datetime | None,
    ) -> tuple[WorkspaceApiToken, str]:
        token_prefix, raw_token = self._generate_raw_token()
        token = WorkspaceApiToken(
            workspace_id=workspace_id,
            created_by_user_id=created_by_user_id,
            name=name,
            token_prefix=token_prefix,
            token_hash=hash_api_token(raw_token),
            scopes=scopes,
            expires_at=expires_at,
        )
        db.add(token)
        await db.flush()
        return token, raw_token

    async def update_token(
        self,
        db: AsyncSession,
        *,
        workspace_id: UUID,
        token_id: UUID,
        name: str,
    ) -> WorkspaceApiToken:
        token = await self.get_token(db, workspace_id, token_id)
        token.name = name
        token.updated_at = datetime.now(timezone.utc)
        await db.flush()
        return token

    async def revoke_token(self, db: AsyncSession, *, workspace_id: UUID, token_id: UUID) -> WorkspaceApiToken:
        token = await self.get_token(db, workspace_id, token_id)
        now = datetime.now(timezone.utc)
        token.is_active = False
        token.revoked_at = now
        token.updated_at = now
        await db.flush()
        return token

    async def get_token(self, db: AsyncSession, workspace_id: UUID, token_id: UUID) -> WorkspaceApiToken:
        result = await db.execute(
            select(WorkspaceApiToken).where(
                WorkspaceApiToken.id == token_id,
                WorkspaceApiToken.workspace_id == workspace_id,
            )
        )
        token = result.scalar_one_or_none()
        if not token:
            raise ValueError("API token not found")
        return token

    async def authenticate_token(
        self,
        db: AsyncSession,
        *,
        raw_token: str,
        ip_address: str | None = None,
    ) -> WorkspaceApiToken | None:
        token_hash = hash_api_token(raw_token)
        result = await db.execute(
            select(WorkspaceApiToken).where(WorkspaceApiToken.token_hash == token_hash)
        )
        token = result.scalar_one_or_none()
        if not token or not token.is_active or token.revoked_at is not None:
            return None
        now = datetime.now(timezone.utc)
        if token.expires_at and token.expires_at < now:
            return None
        token.last_used_at = now
        token.last_used_ip = ip_address
        token.updated_at = now
        await db.flush()
        return token


api_token_service = ApiTokenService()
