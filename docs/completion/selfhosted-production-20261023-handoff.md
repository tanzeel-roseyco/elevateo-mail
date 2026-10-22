# Self-hosted production continuation — 2026-10-23

Status: implementation checkpoint; dedicated application protocol acceptance blocked. **Not live and not production accepted.**
This continuation starts at `cdfe21018edbe3a7faf148f9dea0db3efd4d8187` on
`Tanzeel/elevateo-emailguard-fable` in
`C:/Users/Tanzeel/orca/workspaces/Elevateo Mail - Unified Dashboard 20261020/elevateo-emailguard-fable`.
The similarly named directory under `Code and projects` is an older prototype.

## Implemented areas

- `ops/selfhosted-mail/`: pinned Mox deployment, explicit 120-account CSV import, capacity and
  domain admission, disabled-by-default accounts/domains, private credentials/DKIM keys, TLS
  preflight, provisioning, private application Bundle export, consistent snapshot and restore runbook.
- `ops/production/initialize/`: offline source-bound plans, protected evidence gates, existing
  four bootstrap scripts followed by restricted-role Rails migrations, transactional owner-first
  enrollment using an existing confirmed Google Auth identity. No Auth reset or automatic signup.
- `apps/server/`: separate production Mox SMTP/IMAP routing, account/version/tenant-bound
  credentials, verified TLS, explicit domain approval and final send authority, durable unknown
  outcomes without automatic replay. Fixture transport remains distinct.

## Evidence and limits

The isolated Mox production `serve` run passed real A-to-B SMTP587 STARTTLS delivery and
verified-TLS IMAP993 receipt, mailbox isolation, invalid credentials, unauthenticated relay denial,
certificate rejection, populated backup verification, restart persistence and isolated restore.
The container had no external network or published ports; a loopback authoritative DNS fixture
allowed real internal queue delivery. Three messages survived restart and restore. This proves
local protocol/persistence behavior, not public deliverability, reputation or provider port access.
Unknown local recipients receive upstream's final DATA rejection, rather than RCPT-time rejection.

Initializer regression tests: 13 passed in fleet Docker; strict mypy passed six files.
Actual pinned Supabase Auth and Storage services created their schemas before a full database,
globals and Storage filesystem-fixture backup was restored into an isolated same-version database.
All 43 application migrations, four bootstraps, tenant replay and two failure rollbacks passed.
The five-row protected digest remained unchanged; source database was untouched. This is a
synthetic populated restore, not proof of actual production backups or Storage API uploads.
Receipt: `ops/production/initialize/rehearsal-final-initrepair.log`.

The held production worker overlay passed 37 merged configuration assertions and three
missing-input rejection cases. It exposes no ports and enables neither automatic SMTP dispatch
nor API sending. SMTP uses an explicit one-pass activation; IMAP has a separate opt-in profile.
Runbook: `ops/production/README-mox.md`.
Full backend verification passed 209 suites, 1,204 tests and 13,808 assertions with zero
failures/errors. Strict Steep types and canonical RuboCop lint passed. Three dedicated
real-protocol cases skip in the default gate. The explicit isolated harness failed before Ruby

Review receipts are the `selfhosted-review-*-20261023.md` files and `code-reviews.md`.
Source review is bounded and hash-specific; zero findings never means whole-project approval.
Raw initializer console logs are retained byte-for-byte with their evidence manifest. Their terminal
carriage returns trigger Git whitespace diagnostics; source/documentation whitespace checks exclude
these raw `.log` receipts. No runtime code is excluded. Final SQL EOF-only cleanup changes source
hashes; activation must generate a fresh exact-source plan rather than reuse a rehearsal gate.
Obsidian integration was unavailable; failure/tradeoff simulations are recorded in the design
and infrastructure receipts without claiming external synchronization.

## Activation inputs still required

1. Authorized dedicated Linux host/IP or existing Coolify resource access and an approved
   storage/quota budget. Shared fleet free space is not reserved production capacity. Verify
   outbound TCP25 entitlement and inbound reachability, host PTR, firewall, patching and monitoring.
2. Exact owned FQDNs for Roseyco, Flooda, Bluepillar, Elevateo and Boltloop.co, plus a reviewed
   120-address assignment. Four brand names are not FQDNs. Preserve existing Workspace MX and
   routing; existing Workspace apexes cannot silently move to this server. Select explicit routing
   only after its impact is known. No substitute subdomains or external addresses were invented.
3. SSO identity-provider credentials. The implemented Google SSO route requires a Google OAuth
   client ID/secret and exact redirect allowlist. Self-hosting Supabase provides the auth service;
   it does not supply the upstream Google OAuth registration. No Gmail scopes are requested.
4. Encrypted off-host backups, protected recovery-key custody, retention and measured recovery
   objectives. The local Mox snapshot and synthetic restore do not protect against host loss.
5. Current security/provenance review of the pinned Mox image and build runtime, followed by
   exact-configuration deployment and authorized external acceptance. Reproducible pins alone
   are not proof of absence of vulnerabilities.

## Ordered activation

Keep application, control-file and mail-server holds enabled throughout preparation.
Create and restore protected full DB/global/Storage backups; accept exact source/evidence gates;
initialize schema and enroll the verified owner. Provision real application mailbox/account rows
and the approved 120 Mox accounts; export a Bundle from actual identity/version metadata.
Install trusted TLS and the accepted production image/configuration privately. Verify healthy
held API/worker/inbound processes, per-mailbox isolation, rotation/revocation and recovery.
Configure the Google provider and verified membership before exposing Railway's SSO-only edge.
Then attach `mail.elevateoco.com` using the Railway CLI and DNS-only records, with no Cloudflare
proxy, Access or application component. Verify browser login/logout/session expiry and real
desktop/mobile UI before admitting users. Release mail holds only after domain evidence,
budgets, consent/suppression and a bounded transparent acceptance plan are accepted.

No public deploy, production database mutation, DNS/MX change, purchase, Cloudflare application
change or external test mail occurred in this continuation. Resend remains six HTTP calls,
zero sends; the agreed hard cap is 100 calls. The 120 production accounts remain planned.

## Inherited product limits

The unified inbox and marketing dashboard exist. Settings outside backend-owned APIs remain
explicit simulated adapters. Campaigns are consented single-message batches of at most 25,
not a complete multi-step marketing automation suite. No Sent folder or permanent deletion is
implemented. These limits are unchanged by self-hosted transport work; this receipt does not
claim the entire requested product is complete.

## Cleanup and local artifacts

Mail runtime and overlay disposable containers and staging were removed; shared images,
persistent data and other tasks' resources were preserved. Initializer exact cleanup passed: two disposable images and 3,841,159 bytes of staging removed; shared resources retained. Backend final cleanup passed: task containers, images, builder cache, volumes, networks and staging absent; shared bases retained. Fleet is Linux; Windows Docker virtual-disk compaction is not applicable
to these remote builds. No broad image/cache/volume pruning was performed.

Automatic approval review rejected removal of the task-owned temporary wheel downloads
without a detailed reason. `C:/Users/Tanzeel/AppData/Local/Temp/mailruntime20261023-wheels`
was retained (24,016,429 bytes); the rejected deletion was not retried.
Unrelated pre-existing untracked research and config-followup raw evidence remain untouched.
