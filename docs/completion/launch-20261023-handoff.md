# Launch handoff — 2026-10-23

Status at 18:49 UTC on 2026-10-22: **not deployed; live acceptance incomplete**.

## Authoritative source

Worktree: `C:\Users\Tanzeel\orca\workspaces\Elevateo Mail - Unified Dashboard 20261020\elevateo-emailguard-fable`

Branch: `Tanzeel/elevateo-emailguard-fable`. Starting HEAD: `32c76167442c26dc0782a3295976d7d66ac806c8`.
Frontend changes were authored by confirmed Claude Fable 5.1 workers in the separate
`elevateo-launch-sso-fable-20261023` worktree and integrated by the coordinator. Original commit
`ec4d81b89a220be83757c0cbc71218dce7c1d594`; final accessibility/test repair
`9188737b3303bf30f0f851ced9a702a2325e3770`. Integration preserves existing backend changes.

## Completed and verified

| Area | Implementation / evidence | Result and limit |
| --- | --- | --- |
| Google SSO backend | `apps/server/lib/elevateo/google_sso.rb`, `apps/server/app/controllers/v1/sso_controller.rb`, `docs/completion/launch-20261023-google-sso.md` | PKCE/state, opaque session and existing membership checks; scoped 65 tests / 507 assertions PASS. No real Google login. |
| Sign-in UI | `apps/web/src/features/auth/SignInPage.tsx`, `docs/completion/launch-sso/README.md` | Full 1,063-test gate PASS, subsequent 29 targeted tests and 10 browser cases PASS. Root inspected all 14 desktop/mobile screenshots. |
| Backend/configuration | `docs/completion/config-followup-20261023/verification.md` | Full gate 205 suites / 1,169 tests / 13,577 assertions PASS; Steep, lint, authenticated HTTP, Mailpit and worker drain PASS. |
| Restricted transport | `ops/railway/transport.compose.yaml`, `docs/completion/launch-20261023-transport.md` | Allowed forwards and denied shell/other destinations/remote Unix forwarding verified; cleanup failures tested and propagated. No production transport started. |
| Railway edge | `ops/railway/`, `docs/completion/launch-20261023-edge.md` | Production build PASS; final 234 isolated startup/routing assertions PASS, with 156-line independent review finding zero defects. See `launch-20261023-edge-followup.md`. Real Railway connectivity and live redirects remain unverified. |
| Resend/Postman | `C:\Users\Tanzeel\Code and projects\Elevateo Resend Launch 20261023\resend.postman_collection.json` | Two Newman runs, six HTTP requests total, assertions PASS, zero emails sent. Domain/webhook listing is not delivery acceptance. |

## Remaining activation work, in dependency order

Existing product limits also remain: several settings adapters are explicitly simulated rather
than server-persisted; campaign runs are single-message batches of up to 25 consented recipients,
not automatic multi-step sequences or full Instantly parity; there is no Sent folder or permanent
delete. These limits predate the SSO work and are documented in README and the design receipts.
Older visual matrices include measured deviations from the strict 1–2px reference requirement;
the login screenshot inspection does not certify every application page against that requirement.
The prelaunch security report also recommends a CSP and restart-policy assessment before public
traffic; the remaining attack-surface inventory is not an exhaustive live audit.

1. Obtain a Google OAuth web-client ID and secret with exact redirect URI
   `https://mail.elevateoco.com/auth/v1/callback`. Configure the existing private Auth service for
   Google-only SSO and the exact public app origin. Do not change Workspace MX, mail routing or
   Google domain settings. No credentials were available in the inspected configuration.
2. Back up database, global roles and persistent storage and verify restoration before initializing
   application schema. The existing database has Supabase schemas but no Elevateo application
   schema, runtime roles, migrations or organization membership. See
   `launch-20261023-schema-initialization-assessment.md`; it is an assessment, not an executable
   production migration authorization or full historical migration audit. Never run disposable test
   runners, reset/drop/schema-load commands or rollback fixtures against production.
3. Establish a reviewed tenant bootstrap using actual verified Auth UUIDs. Existing enrollment SQL
   requires organization and membership records; it does not create them. Google authentication
   alone must not grant application access. Provision mailbox ownership through the same authority.
4. Provision real inboxes through the selected mailbox provider. Resend sending/receiving domains
   do not create 120 individual mailboxes. Provider administrator credentials, exact domain FQDNs
   for Roseyco/Flooda/Bluepillar/Elevateo and mailbox access are unresolved; only Boltloop.co was
   supplied as a full domain. Do not invent domains, purchase 120 paid licences, or treat aliases as
   inboxes. Preserve existing Workspace service.
   A concrete draft of 120 unique local parts, ten per named person, is saved at
   `C:\Users\Tanzeel\Code and projects\Elevateo Resend Launch 20261023\mailbox-provisioning-plan.csv`.
   Domains/providers are explicitly unassigned; the CSV is not evidence of provisioned accounts.
5. Deploy only reviewed immutable server images through `ops/production/deploy.sh`, with outbound
   held and provider ingestion blocked. Provision restricted SSH keys/host pin, protected per-process
   environment files and readiness checks. Do not put credentials in browser build variables.
6. Deploy the edge once to existing Railway project `d829ba11-e7fb-4afe-9050-3ee888b5b58f`, production
   environment `e2cdc305-5dbd-49b4-8457-f147930cf22e`, web service
   `a0c1e1a9-83d3-4377-8864-7fcfcd6babe3`. Use `ops/railway/railway.json`, confirm the actual CLI
   config/source-root selection, configure `mail.elevateoco.com` as a DNS-only custom domain and
   verify Railway TLS. **No Cloudflare proxy, Access, Worker or tunnel.** No Railway deployment or
   domain mutation was performed during the recorded checks.
7. Verify real SSO success and denial, callback replay/expiry, cookie security, tenant isolation,
   logout, reads/search/drafts/attachments, mobile UI and failure paths. An edge health response
   cannot establish this acceptance. Run the requested exhaustive live cybersecurity audit after
   there is a live target; the separate prelaunch source review is not a substitute.
8. Verify signed webhook destination/secret, owned sending identities and receiving integration.
   The listed webhook currently points to `elevateo-projects.vercel.app`; its ownership/relationship
   is unconfirmed and it was not changed. Keep sending held until these checks pass. Schedule only
   transparent internal mail tests among real provisioned inboxes, preserving the **100 total live
   Resend HTTP request cap**. Budget ledger currently records **6 used, 94 remaining, 0 sends**;
   120 requested inboxes do not increase that cap. No warmup job is running.

## Cleanup and retained data

Task backend containers, two disposable database volumes, network and verified unused image were
removed. Transport/proxy test resources and temporary keys were removed with absence checks.
Root removed `elevateo-railway-edge-20261023:check` and verified unused task staging/archive at
`/tmp/elevateo-railway-edge-20261023{,.tar.gz}`. Fleet free space changed from 68,483,665,920 to
68,572,172,288 bytes across that edge cleanup; concurrent workload activity prevents assigning all
88,506,368 bytes to this task. Shared builder cache and pinned shared images are retained because
ownership cannot be established safely. No broad prune or Windows Docker disk compaction was run:
tests used the Linux fleet host. Persistent Supabase data/services, existing previews, credentials
and unrelated repositories are preserved. The local test archive and evidence are retained.

No production database/Auth mutation, external email, Cloudflare change or Workspace routing
change occurred. The incomplete activation gates are recorded plainly rather than bypassed with
fixture users, fake inboxes or an unauthenticated public deployment.
