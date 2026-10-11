"""Create all database tables.

DEPRECATED: Use Alembic migrations instead:
    alembic upgrade head

This script is kept for local dev convenience only. Do NOT use in production.
"""
import asyncio
import warnings

from app.database import engine, Base
from app.models import *  # noqa: F401,F403 — import all models so they register


async def main():
    warnings.warn(
        "create_tables.py is deprecated. Use 'alembic upgrade head' for production.",
        DeprecationWarning,
        stacklevel=2,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await engine.dispose()
    print("✅ All tables created successfully!")
    print("⚠️  WARNING: Use 'alembic upgrade head' for production deployments.")


if __name__ == "__main__":
    asyncio.run(main())
