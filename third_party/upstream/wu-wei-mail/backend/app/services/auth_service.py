"""Authentication service — register, login, token management."""

from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.user import User
from app.models.workspace import Workspace
from app.utils.security import (
    hash_password, verify_password, create_access_token,
    validate_password, normalize_email,
    create_refresh_token_record, rotate_refresh_token, revoke_user_refresh_tokens,
)


class AuthService:

    async def register(
        self,
        db: AsyncSession,
        email: str,
        password: str,
        full_name: str,
        workspace_name: str,
    ) -> tuple[User, str, str]:
        """Register a new user + workspace. Returns (user, access_token, refresh_token)."""
        # Normalize and validate
        email = normalize_email(email)
        validate_password(password)

        # Check if email exists
        result = await db.execute(select(User).where(User.email == email))
        if result.scalar_one_or_none():
            raise ValueError("Email already registered")

        # Create workspace
        slug = workspace_name.lower().replace(" ", "-")
        existing = await db.execute(select(Workspace).where(Workspace.slug == slug))
        if existing.scalar_one_or_none():
            import uuid as _uuid
            slug = f"{slug}-{str(_uuid.uuid4())[:8]}"

        workspace = Workspace(name=workspace_name, slug=slug)
        db.add(workspace)
        await db.flush()

        # Create user
        user = User(
            workspace_id=workspace.id,
            email=email,
            hashed_password=hash_password(password),
            full_name=full_name,
            role="owner",
        )
        db.add(user)
        await db.flush()

        # Generate tokens
        access_token = create_access_token({"sub": str(user.id), "workspace_id": str(workspace.id)})
        refresh_token = await create_refresh_token_record(db, user.id)
        return user, access_token, refresh_token

    async def login(self, db: AsyncSession, email: str, password: str) -> tuple[User, str, str]:
        """Authenticate user and return (user, access_token, refresh_token)."""
        email = normalize_email(email)

        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

        if not user or not verify_password(password, user.hashed_password):
            raise ValueError("Invalid email or password")

        if not user.is_active:
            raise ValueError("Account is deactivated")

        access_token = create_access_token({"sub": str(user.id), "workspace_id": str(user.workspace_id)})
        refresh_token = await create_refresh_token_record(db, user.id)
        return user, access_token, refresh_token

    async def refresh(self, db: AsyncSession, raw_refresh_token: str) -> tuple[User, str, str]:
        """Rotate refresh token and issue new access token.

        Returns (user, new_access_token, new_refresh_token).
        """
        user_id, new_refresh = await rotate_refresh_token(db, raw_refresh_token)

        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user or not user.is_active:
            raise ValueError("User not found or inactive")

        access_token = create_access_token({"sub": str(user.id), "workspace_id": str(user.workspace_id)})
        return user, access_token, new_refresh

    async def logout(self, db: AsyncSession, user_id: UUID) -> None:
        """Revoke all refresh tokens for the user."""
        await revoke_user_refresh_tokens(db, user_id)

    async def refresh_token(self, user: User) -> str:
        """Issue a fresh access token for an authenticated user (legacy compat)."""
        return create_access_token({"sub": str(user.id), "workspace_id": str(user.workspace_id)})


auth_service = AuthService()
