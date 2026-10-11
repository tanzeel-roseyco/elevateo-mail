"""Email sending service: SMTP, Gmail API, and Microsoft Graph."""

import base64
import logging
import random
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr, make_msgid
from typing import Optional

import aiosmtplib
import httpx

from app.models.email_account import EmailAccount
from app.utils.encryption import decrypt, encrypt
from app.utils.redis_client import get_account_sent_today

logger = logging.getLogger(__name__)

GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
GRAPH_CREATE_DRAFT_URL = "https://graph.microsoft.com/v1.0/me/messages"
GRAPH_SEND_DRAFT_URL_TEMPLATE = "https://graph.microsoft.com/v1.0/me/messages/{message_id}/send"
GRAPH_GET_MESSAGE_URL_TEMPLATE = (
    "https://graph.microsoft.com/v1.0/me/messages/{message_id}"
    "?$select=id,internetMessageId,conversationId"
)


def resolve_smtp_security(smtp_port: int, smtp_use_tls: bool) -> tuple[bool, bool]:
    """Return (use_tls, start_tls) with sensible defaults for SMTP ports."""
    if not smtp_use_tls:
        return False, False
    if smtp_port == 465:
        return True, False
    # Port 587 should use STARTTLS by default.
    return False, True


class EmailSender:
    """Send emails via SMTP, Gmail API, or Microsoft Graph."""

    @staticmethod
    def generate_message_id(sender_email: str) -> str:
        domain = sender_email.split("@", 1)[1] if "@" in sender_email else "localhost"
        return make_msgid(domain=domain)

    async def send(
        self,
        to: str,
        subject: str,
        body: str,
        account: EmailAccount,
        from_name: Optional[str] = None,
        reply_to: Optional[str] = None,
        in_reply_to: Optional[str] = None,
        html: bool = True,
        message_id: Optional[str] = None,
    ) -> str:
        """Send an email and return the persisted Message-ID token."""
        if account.provider == "google":
            return await self._send_gmail(
                to, subject, body, account, from_name, reply_to, in_reply_to, html, message_id
            )
        if account.provider == "microsoft":
            return await self._send_microsoft(
                to, subject, body, account, from_name, reply_to, in_reply_to, html, message_id
            )
        return await self._send_smtp(
            to, subject, body, account, from_name, reply_to, in_reply_to, html, message_id
        )

    async def _send_smtp(
        self,
        to: str,
        subject: str,
        body: str,
        account: EmailAccount,
        from_name: Optional[str],
        reply_to: Optional[str],
        in_reply_to: Optional[str],
        html: bool,
        message_id: Optional[str],
    ) -> str:
        msg = self._build_mime_message(
            to, subject, body, account, from_name, reply_to, in_reply_to, html, message_id
        )
        resolved_message_id = msg["Message-ID"]
        use_tls, start_tls = resolve_smtp_security(account.smtp_port, account.smtp_use_tls)

        try:
            smtp_password = decrypt(account.smtp_password) if account.smtp_password else None
            await aiosmtplib.send(
                msg,
                hostname=account.smtp_host,
                port=account.smtp_port,
                username=account.smtp_username,
                password=smtp_password,
                use_tls=use_tls,
                start_tls=start_tls,
                timeout=30,
            )
        except aiosmtplib.SMTPException as exc:
            raise ConnectionError(f"SMTP send failed: {str(exc)}")

        return resolved_message_id

    async def _send_gmail(
        self,
        to: str,
        subject: str,
        body: str,
        account: EmailAccount,
        from_name: Optional[str],
        reply_to: Optional[str],
        in_reply_to: Optional[str],
        html: bool,
        message_id: Optional[str],
    ) -> str:
        access_token = await self._ensure_oauth_token(account)
        msg = self._build_mime_message(
            to, subject, body, account, from_name, reply_to, in_reply_to, html, message_id
        )
        resolved_message_id = msg["Message-ID"]
        raw_b64 = base64.urlsafe_b64encode(msg.as_bytes()).decode("ascii")

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                GMAIL_SEND_URL,
                headers={"Authorization": f"Bearer {access_token}"},
                json={"raw": raw_b64},
            )
            if resp.status_code == 401:
                access_token = await self._refresh_token(account)
                resp = await client.post(
                    GMAIL_SEND_URL,
                    headers={"Authorization": f"Bearer {access_token}"},
                    json={"raw": raw_b64},
                )
            if resp.status_code >= 400:
                raise ConnectionError(f"Gmail API send failed ({resp.status_code}): {resp.text}")

        return resolved_message_id

    async def _send_microsoft(
        self,
        to: str,
        subject: str,
        body: str,
        account: EmailAccount,
        from_name: Optional[str],
        reply_to: Optional[str],
        in_reply_to: Optional[str],
        html: bool,
        message_id: Optional[str],
    ) -> str:
        access_token = await self._ensure_oauth_token(account)
        display_name = from_name or account.display_name or ""
        tracked_message_id = message_id or self.generate_message_id(account.email)

        message_payload: dict = {
            "subject": subject,
            "body": {
                "contentType": "HTML" if html else "Text",
                "content": body,
            },
            "toRecipients": [{"emailAddress": {"address": to}}],
            "from": {
                "emailAddress": {"name": display_name, "address": account.email}
            },
            "internetMessageHeaders": [
                {"name": "X-WuWei-Message-ID", "value": tracked_message_id},
            ],
        }
        if reply_to:
            message_payload["replyTo"] = [{"emailAddress": {"address": reply_to}}]
        if in_reply_to:
            message_payload["internetMessageHeaders"].extend(
                [
                    {"name": "In-Reply-To", "value": in_reply_to},
                    {"name": "References", "value": in_reply_to},
                ]
            )

        async with httpx.AsyncClient(timeout=30) as client:
            create_headers = {
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
                "Prefer": 'IdType="ImmutableId"',
            }
            create_resp = await client.post(
                GRAPH_CREATE_DRAFT_URL,
                headers=create_headers,
                json=message_payload,
            )
            if create_resp.status_code == 401:
                access_token = await self._refresh_token(account)
                create_headers["Authorization"] = f"Bearer {access_token}"
                create_resp = await client.post(
                    GRAPH_CREATE_DRAFT_URL,
                    headers=create_headers,
                    json=message_payload,
                )
            if create_resp.status_code >= 400:
                raise ConnectionError(
                    f"Microsoft Graph draft create failed ({create_resp.status_code}): {create_resp.text}"
                )
            draft = create_resp.json() if create_resp.content else {}
            graph_message_id = draft.get("id")
            internet_message_id = draft.get("internetMessageId")
            if not graph_message_id:
                raise ConnectionError("Microsoft Graph draft create succeeded without message id")

            send_url = GRAPH_SEND_DRAFT_URL_TEMPLATE.format(message_id=graph_message_id)
            send_headers = {
                "Authorization": f"Bearer {access_token}",
                "Prefer": 'IdType="ImmutableId"',
            }
            send_resp = await client.post(send_url, headers=send_headers)
            if send_resp.status_code == 401:
                access_token = await self._refresh_token(account)
                send_headers["Authorization"] = f"Bearer {access_token}"
                send_resp = await client.post(send_url, headers=send_headers)
            if send_resp.status_code >= 400:
                raise ConnectionError(
                    f"Microsoft Graph send failed ({send_resp.status_code}): {send_resp.text}"
                )

            if not internet_message_id:
                get_url = GRAPH_GET_MESSAGE_URL_TEMPLATE.format(message_id=graph_message_id)
                get_headers = {
                    "Authorization": f"Bearer {access_token}",
                    "Prefer": 'IdType="ImmutableId"',
                }
                get_resp = await client.get(get_url, headers=get_headers)
                if get_resp.status_code == 401:
                    access_token = await self._refresh_token(account)
                    get_headers["Authorization"] = f"Bearer {access_token}"
                    get_resp = await client.get(get_url, headers=get_headers)
                if get_resp.status_code < 400 and get_resp.content:
                    fetched = get_resp.json()
                    internet_message_id = fetched.get("internetMessageId")
                    graph_message_id = fetched.get("id", graph_message_id)

        # Prefer the actual Graph internetMessageId for reply matching.
        if internet_message_id:
            return internet_message_id
        return f"graph:{graph_message_id}"

    async def _ensure_oauth_token(self, account: EmailAccount) -> str:
        """Return a valid OAuth access token, refreshing if near expiry."""
        if not account.oauth_access_token:
            raise ConnectionError(f"No OAuth access token for account {account.email}")

        access_token = decrypt(account.oauth_access_token)
        if account.oauth_token_expires_at:
            if account.oauth_token_expires_at < datetime.now(timezone.utc) + timedelta(minutes=5):
                access_token = await self._refresh_token(account)
        return access_token

    async def _refresh_token(self, account: EmailAccount) -> str:
        """Refresh OAuth token and update model fields in-place."""
        if not account.oauth_refresh_token:
            raise ConnectionError(f"No refresh token for account {account.email}")

        refresh_token = decrypt(account.oauth_refresh_token)
        if account.provider == "google":
            from app.services.oauth_service import refresh_google_token

            data = await refresh_google_token(refresh_token)
        elif account.provider == "microsoft":
            from app.services.oauth_service import refresh_microsoft_token

            data = await refresh_microsoft_token(refresh_token)
        else:
            raise ConnectionError(f"Cannot refresh token for provider '{account.provider}'")

        new_access_token = data["access_token"]
        expires_in = data.get("expires_in", 3600)
        account.oauth_access_token = encrypt(new_access_token)
        account.oauth_token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
        if account.provider == "microsoft" and data.get("refresh_token"):
            account.oauth_refresh_token = encrypt(data["refresh_token"])
        logger.info("Refreshed OAuth token for account %s (%s)", account.email, account.provider)
        return new_access_token

    def _build_mime_message(
        self,
        to: str,
        subject: str,
        body: str,
        account: EmailAccount,
        from_name: Optional[str],
        reply_to: Optional[str],
        in_reply_to: Optional[str],
        html: bool,
        message_id: Optional[str],
    ) -> MIMEMultipart:
        msg = MIMEMultipart("alternative")
        display_name = from_name or account.display_name or ""
        msg["From"] = formataddr((display_name, account.email))
        msg["To"] = to
        msg["Subject"] = subject
        msg["Message-ID"] = message_id or self.generate_message_id(account.email)

        if reply_to:
            msg["Reply-To"] = reply_to
        if in_reply_to:
            msg["In-Reply-To"] = in_reply_to
            msg["References"] = in_reply_to

        if html:
            msg.attach(MIMEText(body, "html"))
        else:
            msg.attach(MIMEText(body, "plain"))
        return msg

    def select_account(self, campaign_accounts: list) -> Optional[EmailAccount]:
        """Weighted account selection honoring limits and health score."""
        available = []
        weights = []

        for ca in campaign_accounts:
            account = ca.account
            if not account or not account.is_active:
                continue

            sent_today = get_account_sent_today(str(account.id))
            effective_limit = account.daily_limit
            if account.warmup_enabled and account.warmup_level < account.daily_limit:
                effective_limit = account.warmup_level
            if sent_today >= effective_limit:
                continue

            available.append(account)
            weight = ca.weight * account.health_score
            remaining_ratio = 1 - (sent_today / max(effective_limit, 1))
            weight *= 0.5 + (0.5 * remaining_ratio)
            weights.append(max(weight, 0.01))

        if not available:
            return None
        return random.choices(available, weights=weights, k=1)[0]


email_sender = EmailSender()
