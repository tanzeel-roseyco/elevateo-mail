# Inbound Webhook Runbook

Production endpoint: `POST /track/webhook/inbound`

## Security

- Configure `WEBHOOK_SIGNING_SECRET`.
- Signature header: `X-Webhook-Signature`.
- Accepted format:
  - raw hex digest
  - `sha256=<hex>`
- Digest algorithm: `HMAC_SHA256(secret, raw_request_body)`.
- In production (`DEBUG=false`), requests are rejected if secret is missing.

## Payload Contract (canonical)

The backend normalizes common provider payload formats into:

```json
{
  "from_email": "lead@example.com",
  "to_email": "sender@company.com",
  "subject": "Re: Hello",
  "body_text": "text body",
  "body_html": "<p>html body</p>",
  "message_id": "<incoming@example.com>",
  "in_reply_to": "<outbound@example.com>",
  "headers": { "in-reply-to": "<outbound@example.com>" },
  "content_type": "multipart/alternative"
}
```

Supported input aliases include `from/sender`, `to/recipient`, `text/html`, `body-plain/body-html`, and provider `Headers`.

## Correlation Rules

Reply matching order:

1. `in_reply_to` and header-derived references
2. `SentEmail.message_id` exact/normalized match (`<id>` and `id`)
3. Non-Microsoft fallback to latest account+lead sent email

Microsoft correlation intentionally avoids broad fallback to reduce false matches.

## Operational Checks

1. Confirm webhook sender signs raw JSON body with `WEBHOOK_SIGNING_SECRET`.
2. Send test payload with known `in_reply_to` and verify:
   - `inbox_messages` row created (`direction=inbound`)
   - `email_events` row created (`event_type=reply` or `bounce`)
3. Verify event processor updates campaign lead state.

## Common Failures

- `401 Missing webhook signature`: sender omitted `X-Webhook-Signature`.
- `401 Invalid webhook signature`: secret mismatch or body transformed before signing.
- `422 from_email and to_email are required`: payload did not contain recognizable sender/recipient fields.
