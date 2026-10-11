# Nine addresses, Resend CLI and Instantly activation

Planning only, 2026-10-12. No actual addresses, credentials, domains, accounts or DNS records were changed. The user requested **nine email addresses across one or two domains**, use of the existing Resend CLI with **no live sends**, and eventual computer-use connection to Instantly warmup. Real mailbox/provider ownership is not yet known.

## Preserve the no-live-send instruction

Instantly warmup sends and receives real email. Therefore “begin warmup” conflicts with the explicit no-live-send constraint in the same brief. Plan and implement the integration with **warmup and campaigns disabled**. Do not activate warmup, test email, forwarding, broadcasts or another real submission until the user explicitly changes that constraint for a defined set of accounts. Completing a local build or receiving credentials does not change it. [Instantly account dashboard and warmup](https://help.instantly.ai/en/articles/11991261-getting-started-with-the-email-accounts-dashboard).

Separate activation stages: A = read-only inventory; B = account authorization/connection with sending held, only after checking connection side effects; C = explicit live-mail/warmup decision. Never interpret approval for B as approval for C. If a connection wizard automatically sends a test or enables warmup and cannot suppress it, stop before that action and record the blocker. Do not assume OAuth or an “Add account” button is side-effect-free.

## Inventory before account creation or migration

Use [the nine-slot template](templates/mailbox-inventory.csv). It deliberately contains placeholders, not invented company addresses. Populate a private operational copy at activation; do not commit passwords, tokens, recovery codes or app passwords. Decide whether each address is an independent inbox, alias, group or forwarding route; nine addresses do not imply nine subscriptions, provider logins or users.

For each slot record domain, mailbox provider, canonical inbox/alias target, Elevateo mailbox and membership boundary, incoming/outgoing route, existing MX ownership, migration/history needs and whether the provider is supported by Instantly. Shared aliases must not duplicate messages, permissions or sending identities accidentally. Start local tests with reserved synthetic domains and both one-domain and two-domain fixtures.

Resend supplies API transport/receiving behavior; self-hosted Supabase supplies database, identity and private storage. Neither a Supabase login nor a Resend API key is an IMAP inbox login. Instantly's documented account paths are Google/Microsoft OAuth or supported IMAP plus SMTP. Check the actual account capabilities before choosing a provider. [Instantly connection requirements](https://help.instantly.ai/en/articles/6222224-how-to-connect-your-email-accounts-to-instantly).

Do not install a self-hosted mail server merely to fill this gap. Compare existing managed mailboxes with a separately justified conventional mail-hosting option. If Resend owns a receiving subdomain, document how those messages enter Elevateo and whether Instantly can operate on a different real inbox. Do not invent a direct Resend-to-Instantly mailbox connector. Do not replace root-domain MX records or start forwarding loops.

## Resend CLI: inspect first, no submission

The official CLI is documented, but `resend` was not found on this session's PATH. That does not prove the user has no installation elsewhere. At the final provider stage, locate the user-designated executable in the authorized workspace or through a supplied path; verify `--version` and `--help` before using its current command schema. Do not install a similarly named package or scrape unrelated private directories. [Official Resend CLI](https://resend.com/docs/cli).

After authorized account access, use the minimum necessary read-only operations such as `resend whoami`, `resend domains list` and `resend domains get <id>`. Avoid pulling message content simply to test connectivity. Return redacted status, never API keys, headers or keychain contents. Use the existing supported secret store; documentation and environment templates contain names only.

Disallow `emails send`, `emails batch`, `emails receiving forward`, `broadcasts send`, broadcast creation with a send option, scripts that call equivalent API endpoints and any provider test that delivers mail. Do not assume an undocumented dry-run flag is safe. Domain creation/verification, webhooks and DNS changes are external mutations requiring their activation scope; they are not part of read-only CLI discovery.

Local implementation uses a deterministic provider simulator with external acceptance evidence, private Mailpit SMTP capture for Auth, with any host UI port bound to loopback, and an explicit no-live-send profile. Tests prove no fallback to Resend or live SMTP, no real recipients in fixtures and no accidental external model calls from the product. Approved build-agent research/consultation is a separate development activity, not application runtime mail access.

## Computer-use plan for Instantly

Use the currently supported Codex/ChatGPT browser or computer-use tools only after verifying the selected account and domain inventory. Read the installed tool's documentation; do not assume an old feature name or invent a browser automation API. Perform account authorization through the provider's normal UI, letting the user complete MFA or consent when necessary. Do not expose or store credential screenshots.

Prefer individual OAuth where supported. If IMAP/SMTP is required, use scoped credentials in the provider's intended fields and keep them out of Git, logs and task briefs. Never bulk-import a credential CSV from this repository. Instantly's documented bulk format can set warmup false, but verify the current flow and final account state before relying on it. [Bulk import and warmup field](https://help.instantly.ai/en/articles/6687763-bulk-import-sending-accounts-into-instantly).

Process one reviewed account first, then repeat for the mapped independent inboxes. Record safe account IDs, provider, connection result and verified disabled warmup/campaign state. Avoid duplicate connection retries by checking the dashboard after uncertain results. Connecting an alias as if it were an independent inbox must fail validation.

Before any future warmup activation: obtain the explicit change to no-live-sends, confirm permitted purpose/provider conditions, select exact accounts and limits, confirm pause/rollback controls and inspect operational results. Warmup is no guarantee of inbox placement. Do not use the research sources to claim deliverability outcomes.

## Acceptance and handoff

- Nine inventory rows map to real account/alias boundaries without invented credentials; one- and two-domain local routing tests pass.
- No-live-send profile blocks provider, CLI, warmup, campaign and forwarding paths, including accidental UI defaults.
- Read-only Resend preflight reports actual executable/version and redacted account/domain status only when available.
- Instantly connection status and warmup state have separate evidence; unavailable credentials/provider capabilities are explicit pending items.
- DNS/MX, production migration, live mail, hosting and installer signing each remain separate final activation decisions. Application completion does not silently perform them.

## Local foundation enforcement (ADR 0002)

Auth invite/recovery messages must use only mailpit:1025 with synthetic senders and local redirect URLs. Disable external Auth hooks/providers and all Mailpit relay, forwarding and webhooks. An internal-only runtime network denies external mail egress; dependency download networks are confined to builds. Route inbound events from authenticated provider envelope data, never untrusted MIME To/Cc headers. These are required controls, not claims that the unbuilt stack already enforces them.
