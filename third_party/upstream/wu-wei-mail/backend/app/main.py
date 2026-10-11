"""Wu Wei Mail — FastAPI application entry point."""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.routers import auth, campaigns, leads, templates, accounts, inbox, analytics, compliance, oauth, tracking, workspace, auto_responder, prospecting, warmup, workflows, outreach, webhooks, developer, external

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    # Startup: could pre-warm connections, etc.
    yield
    # Shutdown: dispose engine
    from app.database import engine
    await engine.dispose()


app = FastAPI(
    title=settings.APP_NAME,
    description="Cold email marketing platform — send smarter, not harder.",
    version="0.1.0",
    lifespan=lifespan,
)

# Security headers (outermost — runs last, so headers are always set)
app.add_middleware(SecurityHeadersMiddleware)

# CORS (explicit allowlists instead of wildcards)
_cors_origins = settings.cors_origins()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)

# Routers
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(campaigns.router, prefix="/api/campaigns", tags=["campaigns"])
app.include_router(leads.router, prefix="/api/leads", tags=["leads"])
app.include_router(templates.router, prefix="/api/templates", tags=["templates"])
app.include_router(accounts.router, prefix="/api/accounts", tags=["accounts"])
app.include_router(inbox.router, prefix="/api/inbox", tags=["inbox"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["analytics"])
app.include_router(compliance.router, prefix="/api/compliance", tags=["compliance"])
app.include_router(oauth.router, prefix="/api/oauth", tags=["oauth"])
app.include_router(tracking.router, prefix="/track", tags=["tracking"])
app.include_router(workspace.router, prefix="/api/workspace", tags=["workspace"])
app.include_router(auto_responder.router, prefix="/api/auto-responder", tags=["auto-responder"])
app.include_router(prospecting.router, prefix="/api/prospecting", tags=["prospecting"])
app.include_router(warmup.router, prefix="/api/warmup", tags=["warmup"])
app.include_router(workflows.router, prefix="/api", tags=["workflows"])
app.include_router(outreach.router, prefix="/api/outreach", tags=["outreach"])
app.include_router(webhooks.router)
app.include_router(developer.router, prefix="/api/developer", tags=["developer"])
app.include_router(external.router, prefix="/api/external/v1", tags=["external"])


@app.get("/health")
async def health_check():
    return {"status": "ok", "app": settings.APP_NAME}
