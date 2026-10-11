"""OAuth2 service for Google and Microsoft email account connections."""

from urllib.parse import urlencode
import httpx

from app.config import get_settings

settings = get_settings()

# ---------------------------------------------------------------------------
# Google OAuth2
# ---------------------------------------------------------------------------

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"
GOOGLE_SCOPES = [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
]


def get_google_auth_url(state: str) -> str:
    """Return the Google OAuth2 consent URL."""
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": " ".join(GOOGLE_SCOPES),
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }
    return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"


async def exchange_google_code(code: str) -> dict:
    """Exchange an authorization code for tokens + user profile.

    Returns: {access_token, refresh_token, expires_in, email, name}
    """
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": settings.GOOGLE_REDIRECT_URI,
            },
        )
        token_resp.raise_for_status()
        tokens = token_resp.json()

        # Fetch user info
        userinfo_resp = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
        )
        userinfo_resp.raise_for_status()
        profile = userinfo_resp.json()

    return {
        "access_token": tokens["access_token"],
        "refresh_token": tokens.get("refresh_token"),
        "expires_in": tokens.get("expires_in"),
        "email": profile.get("email", ""),
        "name": profile.get("name", ""),
    }


async def refresh_google_token(refresh_token: str) -> dict:
    """Refresh a Google access token.

    Returns: {access_token, expires_in}
    """
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
            },
        )
        resp.raise_for_status()
        data = resp.json()

    return {
        "access_token": data["access_token"],
        "expires_in": data.get("expires_in"),
    }


# ---------------------------------------------------------------------------
# Microsoft OAuth2
# ---------------------------------------------------------------------------

MICROSOFT_AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
MICROSOFT_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
MICROSOFT_GRAPH_ME_URL = "https://graph.microsoft.com/v1.0/me"
MICROSOFT_SCOPES = [
    "Mail.Send",
    "Mail.ReadWrite",
    "User.Read",
    "offline_access",
]


def get_microsoft_auth_url(state: str) -> str:
    """Return the Microsoft OAuth2 consent URL."""
    params = {
        "client_id": settings.MICROSOFT_CLIENT_ID,
        "redirect_uri": settings.MICROSOFT_REDIRECT_URI,
        "response_type": "code",
        "scope": " ".join(MICROSOFT_SCOPES),
        "response_mode": "query",
        "state": state,
    }
    return f"{MICROSOFT_AUTH_URL}?{urlencode(params)}"


async def exchange_microsoft_code(code: str) -> dict:
    """Exchange an authorization code for tokens + user profile.

    Returns: {access_token, refresh_token, expires_in, email, name}
    """
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            MICROSOFT_TOKEN_URL,
            data={
                "client_id": settings.MICROSOFT_CLIENT_ID,
                "client_secret": settings.MICROSOFT_CLIENT_SECRET,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": settings.MICROSOFT_REDIRECT_URI,
                "scope": " ".join(MICROSOFT_SCOPES),
            },
        )
        token_resp.raise_for_status()
        tokens = token_resp.json()

        # Fetch user profile from MS Graph
        profile_resp = await client.get(
            MICROSOFT_GRAPH_ME_URL,
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
        )
        profile_resp.raise_for_status()
        profile = profile_resp.json()

    return {
        "access_token": tokens["access_token"],
        "refresh_token": tokens.get("refresh_token"),
        "expires_in": tokens.get("expires_in"),
        "email": profile.get("mail") or profile.get("userPrincipalName", ""),
        "name": profile.get("displayName", ""),
    }


async def refresh_microsoft_token(refresh_token: str) -> dict:
    """Refresh a Microsoft access token.

    Returns: {access_token, refresh_token, expires_in}
    """
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            MICROSOFT_TOKEN_URL,
            data={
                "client_id": settings.MICROSOFT_CLIENT_ID,
                "client_secret": settings.MICROSOFT_CLIENT_SECRET,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
                "scope": " ".join(MICROSOFT_SCOPES),
            },
        )
        resp.raise_for_status()
        data = resp.json()

    return {
        "access_token": data["access_token"],
        "refresh_token": data.get("refresh_token", refresh_token),  # MS may rotate
        "expires_in": data.get("expires_in"),
    }
