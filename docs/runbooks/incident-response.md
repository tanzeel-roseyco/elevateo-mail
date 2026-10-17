# Runbook: incident response

For security incidents, data exposure, provider abuse warnings and outages during the private pilot. One named owner (business hours, Australia/Sydney) and one second operator must both be able to run every step.

## Severity

| Level | Definition | Examples |
| --- | --- | --- |
| SEV1 | Data exposure, credential compromise, or sends leaving without approval | Cross-tenant read, leaked mailbox credential, Resend account shut down for complaints |
| SEV2 | Service down or sends stalled for more than an hour | VPS down, PostgreSQL out of disk, worker crash loop |
| SEV3 | Degraded, no data risk | Slow search, one mailbox failing IMAP |

## First 15 minutes

1. Start an incident note: time, reporter, what is known, who is on it.
2. Contain before diagnosing:
   - Stop outbound mail: set `ELEVATEO_OUTBOUND_HOLD=true` and restart the API and worker (the worker respects the hold before provider I/O).
   - Suspected account compromise: global logout for the user (`POST /v1/auth/logout`, `scope: global`) and bump the affected mailbox `credential_version` so in-flight attempts are fenced.
   - Suspected host compromise: snapshot the server in the Hetzner console for evidence, then rotate secrets per the schedule below.
3. Preserve evidence: copy API and worker logs, `app_send_private.audit_events`, `app.organization_role_audit` and relevant receipt rows to the incident folder on fleet-02 (never into Git or chat).
4. Tell the pilot users what is affected and what they must not do (for example, do not re-send).

## Provider abuse warnings

Resend shuts accounts without warning above a 0.08% complaint rate or 4% bounce rate (`https://resend.com/legal/acceptable-use`). On any Resend warning: hold outbound, export the bounce and complaint list, suppress those recipients, confirm every remaining recipient has recorded consent (`app.campaign_consent_events`), then resume at reduced volume. Gmail mailbox sends are capped by Google per account; a blocked mailbox stays disabled until Google lifts it, so do not route its queue through another mailbox.

## Key-rotation schedule

| Secret | Where | Cadence | Trigger-based |
| --- | --- | --- | --- |
| PostgreSQL role passwords (migrator, API, worker, gateway) | `ops/supabase/stack.sh <stack> init`, `ops/db/bootstrap*.sql` | Yearly | Any operator departure or device loss |
| Supabase Auth JWT secret and service keys | stack `.env.<stack>` | Yearly | Compromise suspected (invalidates all sessions) |
| Mailbox SMTP and IMAP credentials | `credential_version` bump plus re-enrolment | When Google requires it | Device loss, mailbox owner change |
| Resend API key and webhook signing secret | Resend dashboard, stack env | Yearly | Any leak |
| Hunter, AnymailFinder keys | Provider dashboards | Yearly | Any leak |
| SSH keys for fleet-02 and production | `authorized_keys`, Hetzner project | Yearly | Operator departure, device loss |
| Cloudflare API tokens, GitHub tokens | Provider dashboards | Yearly | Any leak |
| Code-signing certificates (Apple, Azure) | Provider portals | At expiry | Device loss |

Each rotation is recorded in the incident folder with date, operator and what was restarted.

## Data-subject requests (access and erasure)

Until the erasure endpoint (backend task B7) exists, the operator procedure is:

1. Verify the requester controls the address (reply to it).
2. In a read-only session, find the lead rows by email and export the fields held (`app` lead, consent and suppression records) for an access request.
3. For erasure: record consent withdrawal and suppression first (`POST /v2/outreach/leads/:id/withdraw-consent`, `.../suppress`), then delete personal fields from the lead row in a migrator session inside one transaction, keeping only the hashed suppression entry so the address is never contacted again, and write an `audit_events` row describing the erasure.
4. Reply within 30 days with what was removed and what is retained (suppression hash, legal-hold items).

## Postmortem template

Write within five working days of SEV1 or SEV2 resolution; blameless; stored under `docs/operations/postmortems/YYYY-MM-DD-<slug>.md`.

```
# <Title>
Date, duration, severity, author
## Summary (three sentences)
## Impact (users, sends, data)
## Timeline (UTC, from first signal to resolution)
## Root cause
## What went well / what went badly
## Actions (owner, due date, link to issue)
```
