"""Email account model — SMTP/IMAP credentials and sending limits."""

import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Boolean, Integer, Float, ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class EmailAccount(Base):
    __tablename__ = "email_accounts"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id"), nullable=False, index=True)

    # Display
    email: Mapped[str] = mapped_column(String(320), nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(255), nullable=True)

    # SMTP (nullable for OAuth accounts)
    smtp_host: Mapped[str | None] = mapped_column(String(255), nullable=True)
    smtp_port: Mapped[int] = mapped_column(Integer, default=587)
    smtp_username: Mapped[str | None] = mapped_column(String(255), nullable=True)
    smtp_password: Mapped[str | None] = mapped_column(Text, nullable=True)  # encrypted in practice
    smtp_use_tls: Mapped[bool] = mapped_column(Boolean, default=True)

    # IMAP
    imap_host: Mapped[str] = mapped_column(String(255), nullable=True)
    imap_port: Mapped[int] = mapped_column(Integer, default=993)
    imap_username: Mapped[str] = mapped_column(String(255), nullable=True)
    imap_password: Mapped[str] = mapped_column(Text, nullable=True)

    # Limits & health
    daily_limit: Mapped[int] = mapped_column(Integer, default=50)
    sent_today: Mapped[int] = mapped_column(Integer, default=0)
    health_score: Mapped[float] = mapped_column(Float, default=1.0)  # 0.0–1.0
    warmup_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    warmup_level: Mapped[int] = mapped_column(Integer, default=0)  # current daily warmup count

    # OAuth / provider
    provider: Mapped[str] = mapped_column(String(20), default="manual")  # google | microsoft | manual
    oauth_refresh_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    oauth_access_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    oauth_token_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    provider_email: Mapped[str | None] = mapped_column(String(320), nullable=True)

    # DNS verification
    spf_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    dkim_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    dmarc_verified: Mapped[bool] = mapped_column(Boolean, default=False)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("workspace_id", "email", name="uq_email_account_workspace_email"),
    )

    # Relationships
    workspace: Mapped["Workspace"] = relationship("Workspace", back_populates="email_accounts")
    sent_emails: Mapped[list["SentEmail"]] = relationship("SentEmail", back_populates="account", lazy="select")
