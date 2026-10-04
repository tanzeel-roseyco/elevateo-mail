# Mail integrations and delivery boundaries

Research date: 2026-10-04. Research only; no DNS, credentials, mailboxes or recipients accessed. Backend standards remain unapproved. This report considers ten users, manual mailbox/recipient/CSV/message imports, personal email management and consent-only marketing, with hosting below A$15/month excluding mailbox/AI subscriptions. Nine recorded identities are not proof of nine licensed mailboxes; the earlier eighteen figure needs reconciliation.

## Recommendation

Use a Gmail adapter for existing Google mailboxes and personal replies. Keep Resend as an optional consent-only marketing transport, and Instantly/Smartlead as optional managed-campaign adapters. Select exactly one execution authority per campaign. Hosted execution is required for campaigns to continue with Windows switched off. Local AI enrichment must never be an execution dependency. Do not implement any adapter until backend standards and OAuth eligibility are settled.

Preserve root MX for `boltloop.co`, `flooda.co`, and `elevateoco.com` at Google. Treat the reported company SES ownership of `in.elevateoco.com` as an unresolved asset restriction, not an available receiving domain. An approved new receiving subdomain can later serve Resend inbound; it does not retrieve messages addressed to the Google root. `Reply-To` directs ordinary replies, not all future direct messages.

## Gmail synchronization and authorization

[Gmail push](https://developers.google.com/workspace/gmail/api/guides/push) sends mailbox/history identifiers through Pub/Sub, not message bodies. Renew `watch` at least every seven days; Google recommends daily. Notifications can be delayed/dropped, including above one event/second per watched user. A hosted service needs authenticated Pub/Sub handling, durable acknowledgement after recording work, mailbox-specific history cursors and periodic reconciliation. Notification order must not become message order.

[History synchronization](https://developers.google.com/workspace/gmail/api/guides/sync) normally retains history for at least a week, but sometimes less. An expired cursor produces HTTP 404 and requires full synchronization. Reconnect/import recovery must deduplicate by mailbox and provider message ID; an old-message import must not mark messages as new campaign replies.

[Scopes](https://developers.google.com/workspace/gmail/api/auth/scopes): `gmail.send` is sensitive; `gmail.readonly`, `gmail.modify`, `gmail.compose` and even `gmail.metadata` are restricted. Read/send can start with readonly plus send; mailbox state changes need modify. Avoid full `mail.google.com` permanent-deletion access. Server storage/transmission of restricted data triggers the documented security-assessment requirement. [Verification exceptions](https://support.google.com/cloud/answer/13464323) include genuine limited personal use and internal apps owned by one Workspace organization. Ten users alone does not establish the correct exception. Multiple domains may belong to one organization or several; an internal app cannot admit users outside its organization. Confirm organization membership and deployment classification before assuming external verification or an exemption. No assessment price is quoted: hosting below A$15 does not establish an affordable compliance path.

Use authenticated mailbox ownership and accepted [send-as identities](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.settings.sendAs); a manually typed From address is not authorization.

## Exact execution boundary

| Route | Application responsibility | Execution authority |
|---|---|---|
| Gmail personal send/reply | User-approved content, authorized mailbox/identity, thread linkage, durable dispatch record | Gmail adapter sends one message |
| Native Resend campaign | Consent/suppression check immediately before each step, schedule, retries, stop-on-reply, unsubscribe endpoint | Hosted application scheduler |
| Instantly/Smartlead campaign | Approved content/recipient snapshot, provider account mapping, consent evidence, activation gate, suppression propagation and reconciliation | Provider scheduler; application must not send matching steps |

Delegate only eligible recipients. Provider possession of an address is never evidence of permission. With managed scheduling, the app cannot truthfully promise an atomic local consent check at every provider send: define revocation propagation latency and the already-in-flight boundary. Uncertain suppression synchronization must prevent activation or pause affected campaigns. Importing a paused campaign must not activate it implicitly.

## Provider facts and limits

[Resend acceptable use](https://resend.com/legal/acceptable-use) prohibits unsolicited/cold outreach, purchased lists and scraped contact data; explicit opt-in is required. Bulk mail needs sender identification, a contact reason and frictionless opt-out. Product suppression should apply immediately, stricter than the policy's seven-day deadline. Hunter discovery cannot make a lead eligible for Resend.

[Resend limits](https://resend.com/docs/api-reference/rate-limit) currently default to ten requests/second per team across API keys; inspect retry headers and handle 429. Both sent and received email consume email quota. [Idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys) retains keys for 24 hours: keep a longer-lived application ledger, and reconcile unknown outcomes rather than blindly replaying after expiry. [Inbound](https://resend.com/docs/dashboard/receiving/introduction) requires its receiving MX and webhook processing; retrieve [body/headers/attachments](https://resend.com/docs/api-reference/emails/retrieve-received-email) separately as needed. Current beta inbox/thread APIs do not establish a production replacement for existing Gmail mailboxes.

[Instantly's official API starter](https://github.com/Instantly-ai/instantly-starter-kit) specifies v2 Bearer authentication, draft creation followed by explicit activation, and workspace-wide 100 requests/second and 6,000/minute. [Webhooks](https://help.instantly.ai/en/articles/6261906-webhooks) require Hyper Growth or above and expose reply/bounce/unsubscribe/account-error events and optional authentication headers. Do not assume a signing or delivery guarantee not specified there; reconcile provider state.

[Smartlead API documentation](https://helpcenter.smartlead.ai/en/articles/125-full-api-documentation) offers draft/status/schedule/sequence/account APIs, pause and unsubscribe operations, and corresponding events. It places API keys in query parameters: redact URLs from logs and tracing. Its rate-limit guidance is internally inconsistent: plan-specific advice coexists with ten requests/two seconds. Obtain the purchased plan's contract; use configurable conservative throttling and 429 handling rather than treating either number as universal. Confirm webhook authentication/replay behavior before integration.

Provider subscriptions, webhook-plan upgrades and sending charges are separate open budget items; no unverified price is assumed.

## Consent, privacy and reputation

Maintain an auditable consent record per recipient/sender-purpose, plus workspace-wide suppression and scoped provider IDs. Recheck native sends; propagate managed unsubscribes, replies, complaints and hard bounces before further steps. Deduplicate events, tolerate out-of-order delivery, and distinguish reply classification from actual unsubscribe. Soft bounces require bounded policy, not automatic permanent suppression. CSV/manual import defaults to ineligible until evidence is supplied.

Hunter is optional: request only necessary contact/company fields, never mailbox bodies. Timeout or missing enrichment may produce an unpersonalized approved draft; consent/suppression failure blocks sending. A newly discovered replacement address needs its own permission. [Hunter's API](https://hunter.io/api-documentation/v2) is the contract to verify when choosing its endpoint. “AMF” must be confirmed as a product before researching its permissions.

Ten users' Hunter/AMF keys must be isolated by workspace/user, encrypted server-side, narrowly accessible and revocable; never reuse another user's credential silently. Codex/Claude subscriptions are not assumed to authorize server API access. Mail bodies sent to any AI processor need explicit permitted data-flow decisions. Mailbox OAuth grants, imports, queued jobs, webhooks and provider IDs all require tenant authorization; possession of a webhook identifier is insufficient.

Keeping Google MX protects routing, not outbound reputation. Using the same root From domain through another sender can affect company reputation. Separate sending subdomains and IP pools provide partial containment, not guaranteed isolation; provider quotas are not safe-volume promises. Follow [Google sender requirements](https://support.google.com/mail/answer/81126), authentication/alignment, unsubscribe requirements and complaint monitoring. Never rotate identities to evade limits.

## Evidence limits, open issues and acceptance checks

[Forward Pass (2023)](https://arxiv.org/abs/2302.07287) measured forwarding mechanisms/policies that undermine anti-spoofing assumptions. [Weak Links (2020)](https://arxiv.org/abs/2011.08420) measured inconsistencies across authentication chains and mail interfaces. These historical findings do not prove current providers vulnerable or predict inbox placement. Practical inference: prefer direct authorized Gmail synchronization over forwarding, render untrusted content safely, and never interpret SPF/DKIM/DMARC success as user consent or tenant authorization.

Resolve actual mailbox licenses/domains/organizations, volume and retention, verification eligibility, receiving-domain ownership, provider subscription budgets, AMF identity and acceptable managed revocation latency.

Acceptance checks: dropped notifications recover; expired cursors full-sync without duplication; offline desktop campaigns continue; revoked consent stops native sends and pauses/reconciles managed execution; duplicate/out-of-order events cannot resume suppression; unknown send outcomes do not duplicate delivery; forged/cross-tenant events fail authorization; one user's keys/imports cannot leak to another; Hunter outages do not block approved sends; no root MX or existing SES record changes occur.
