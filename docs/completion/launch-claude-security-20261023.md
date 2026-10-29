# Claude security audit of the dirty application — 2026-10-23

Task `task_c8f7f433fcff` / dispatch `ctx_a9323e845a92`. This is a static, read-only source review of the uncommitted
working tree over HEAD `177c4d26883437dd3f10074fc6323da653778da5`. It is **not** a production-readiness
claim, a penetration test or a runtime verification. No code was edited and no tests were run. Nothing was
deployed, no mail was sent and no secrets were read. Only this file was written.

Who did what: the orchestrator ran on `claude-opus-5-5` and did the inventory (wc, grep, diff stat, hashes),
reading under 50 source lines itself. Nine bounded read-only Claude `general-purpose` subagents did the source
inspection. The brief asked for Codex teammates. The Agent tool exposes no Codex route, so the subagents ran
on Claude; their billed model and tier were not independently verified. The Obsidian connection was not
used, so the tradeoff simulations below are analytical only. The full review rubric was included in every
dispatch.

## Affected surface checklist

| Surface | Packet | Reviewed | Result |
| --- | --- | --- | --- |
| Google/Authentik SSO start/callback, PKCE, state, flow cookie | A1 | yes | 1 MEDIUM, 3 LOW |
| Sessions, cookie crypto, auth controller CSRF | A2 | yes | no defect; upstream id_token claims unverified in Rails |
| Organization role grants, role audit, assignee options | B1/B2 | yes | 4 LOW, 2 PLAUSIBLE; no escalation path |
| Tenancy, new `GET /v1/threads` organization list | C1/C2 | yes | 4 LOW, 2 PLAUSIBLE; authz rests on RLS |
| Resend webhooks (both routes go to `resend_events#create`), fake inbound | D1 | yes | 1 MEDIUM (latent duplicate verifier) |
| Railway nginx edge, start.sh, Dockerfile, sshd | D2 | yes | 5 LOW |
| SMTP/IMAP credential bundle, SMTP snapshot, TLS IMAP, worker store | E1/E2 | yes | 2 LOW, 2 PLAUSIBLE |
| Outreach campaigns/accounts controllers | F1 | yes | 3 PLAUSIBLE |
| Inbound message rendering in the web app (thread, rows, attachments) | F2 | yes, read-only | 1 LOW; plain text in `<pre>`, no `innerHTML` |
| Reply identity migration 43 and its SQL, `mail_message_identity`, canonical/review diff | M1/M2 | yes | 1 HIGH-PLAUSIBLE, 3 MEDIUM, 4 LOW |
| Launch mailflow harness `app_chain_test.rb`, `fleet_protocol.py` | H1/H2 | yes | 2 MEDIUM, 1 MEDIUM-PLAUSIBLE, 6 LOW |
| Architecture: CSRF model, authz layering, rate limiting, credential at-rest, outbound hold, deadlines | G | yes (design) | see tradeoffs |
| Not reviewed: `sessions.rb` establish/rotation, `auth_callback_redaction.rb`, `campaigns/input.rb`, SQL RLS policies, `access.sql` audit insert, `ingest_imap_mail_with_identity` body, `owned_imap_client.rb`, frontend `UnifiedInboxPage.tsx` beyond grep, remaining ~25 controllers | — | no | open |

## Findings (most severe first)

The P column marks PLAUSIBLE findings: they depend on code outside the packet or on runtime behaviour.

| Sev | P | File:line | Defect | Exploit / failure condition | Owner |
| --- | --- | --- | --- | --- | --- |
| HIGH | P | `apps/server/db/migrate/mail_reply_identity/up.sql:50-53` | `read_draft_binding` takes the newest thread message by `sent_at` with no `rfc_message_id IS NOT NULL` filter; only IMAP ingest writes the identity. | After any outbound or unparsable message lands in the thread, the next Mox-mode reply returns `reply_unavailable` (`review.rb` diff). This is a functional denial of replies, not a data leak. | mailflow `ctx_4b7700cd00c9` |
| HIGH (design) | | edge `ops/railway/nginx.conf.template`, no `limit_req`, no rack-attack | No rate limiting on `/auth/v1/authorize`, `/v1/auth/sso/*` or any API, and `access_log off`. | Credential stuffing, plus Puma starvation: about 50 slow requests hold threads for the 10 s deadline each. | edge/SSO |
| HIGH (design) | | authorization spread across ~30 controllers | There is no fail-closed policy layer or route-inventory test; some controllers do not inherit `ApiController`. | A new or edited controller can skip org scoping, and nothing would flag the omission. | backend |
| MEDIUM | | `apps/server/lib/elevateo/google_sso.rb:45-50` | When enrollment is denied or unavailable, the upstream GoTrue session and refresh token that were just issued are never revoked. The `establish` failure path does revoke. | With company signup enabled, a denied identity leaves an orphaned upstream credential until its TTL. | SSO `ctx_0c4f8e19305e` |
| MEDIUM | | `apps/server/test/support/launch_mailflows/fleet_protocol.py:139-141,81` | DB role passwords are written to `PRIVATE/app.env`, and `rmtree` runs only after the cleanup container succeeds. | If the cleanup container fails, credentials stay in `/tmp/launch-mailflows-20261023/protocol-j` on fleet-02. | mailflow |
| MEDIUM | | `fleet_protocol.py:148-150` | Fixture cleanup is in `except Exception`, not `finally`. | `KeyboardInterrupt` or `SystemExit` leaves the `-mox` container and the secrets behind. | mailflow |
| MEDIUM | P | `fleet_protocol.py:128` | Mox joins `PROJECT_isolated`; whether that network is `internal: true` was not shown. | If it is not internal, SMTP could egress to the internet by direct IP (live-send risk in a test). | mailflow |
| MEDIUM | | `apps/server/db/migrate/mail_reply_identity/down.sql:7` | Rollback drops `app.messages.rfc_message_id`. | Any rollback after ingest permanently loses imported identities. The only guard checks for v3 intents. | mailflow |
| MEDIUM | P | `mail_reply_identity/snapshot.sql:2-4`, `snapshot_down.sql:15-17` | The intents CHECK is re-added without `NOT VALID`. | Holds an ACCESS EXCLUSIVE lock on a large `intents` table during deploy, blocking sends. | mailflow |
| MEDIUM | | reply-identity tests | No tests for: a reply after an outbound message, the down migration, error codes 23514/22023/42501, Mox mode with a NULL identity, or held mode producing a v1 snapshot. | Finding 1 can ship undetected. | mailflow |
| MEDIUM | P | `apps/server/app/controllers/v2/outreach/campaigns_controller.rb:45-56` | `update` accepts a client `status` with no transition or launch-role check in the controller, and there is no quantity/rate cap. | If `Campaigns::Input` or SQL accepts an active status, any draft writer can launch a campaign. | outreach |
| MEDIUM | P | `apps/server/lib/elevateo/thread_reads.rb:69-77` | `ORGANIZATION_LIST_SQL` filters by org only; mailbox membership and revocation rely entirely on RLS. | An RLS policy gap or a privileged DB role exposes every mailbox in the org through `GET /v1/threads`. | unified `ctx_12a85bc4f59f` |
| MEDIUM | P | `thread_reads.rb:69-77` with `LIST_SQL:15-48` | Per-mailbox sort with a correlated latest-message lookup; cost is mailboxes × threads. | Any member can repeatedly trigger an expensive query (DoS amplification). | unified |
| MEDIUM | P | `apps/server/lib/elevateo/inbound/imap_worker_store.rb` (identity branch) | Bypasses the `query()` leased rewrite and passes a possibly nil `@lease_token` as `$12`. | If the SQL accepts a NULL lease, an unleased worker could write outside the lease fence. | mailflow |
| MEDIUM (latent) | | `apps/server/app/controllers/v2/resend_provider_events_controller.rb:1-21`, `lib/elevateo/resend_webhook.rb` | An unrouted second webhook verifier that is weaker than the live one (no `msg_` check, 1.5 MB body, no header cap, unbounded `raw_post`). | Becomes exploitable only if someone routes it. Delete it or merge it into the live verifier. | backend |
| MEDIUM (design) | | `apps/server/lib/elevateo/request_deadline.rb:23-27` | The outer `Timeout.timeout` can interrupt DB/network I/O at arbitrary points. | A broken connection returns to the pool under load. | backend |
| LOW | | `nginx.conf.template:17-21` | No CSP; HSTS has no `includeSubDomains`. | No backstop if an XSS appears. | edge |
| LOW | P | `nginx.conf.template:45-46` | Stripping `X-Forwarded-For` collapses `remote_ip` to 127.0.0.1. | Any per-IP limit becomes one global bucket, and audit logs lose the client IP. | edge |
| LOW | | `ops/railway/sshd_config:3` | Listens on 0.0.0.0:2222. | Scanning and connection floods; key-only auth mitigates. | ops |
| LOW | | `ops/railway/Dockerfile:15` | `/etc/nginx` is owned by the runtime user. | After code execution in the container, proxy config can be rewritten. | ops |
| LOW | | `ops/railway/start.sh:13-14` | Invalid host/user values fail with no message. | Diagnostics only. | ops |
| LOW | P | `apps/server/app/controllers/v1/sso_controller.rb:93` | Only `AuthError` is rescued. | Other faults return a 500 instead of the `sso_error` redirect. | SSO |
| LOW | | `google_sso.rb:33`, `:22` | Upstream `error` is checked before state validation (nuisance redirect only); long scope ternary. | No real exploit. | SSO |
| LOW | P | `apps/server/app/controllers/campaigns_controller.rb:35`, `accounts_controller.rb:41-45` | The whole body is passed to `Input`, and `mailbox_id` org ownership is not checked in the controller. | Mass assignment or a foreign mailbox attach, if `Input`/FK/RLS do not block it. | outreach |
| LOW | | `apps/web/src/features/thread/MessageAttachments.tsx:37-41,122` | No extension restriction on clean-scanned downloads (`.exe`, `.html`, `.svg`). | Social engineering; a blob plus `download` prevents same-origin XSS. | frontend |
| LOW | | `organization_grants_controller.rb:54-57,128-131,146-151` | Duplicated nil/role guards; the `last_item` guard can never fire; the new guards have no tests. | Maintenance only. | unified |
| LOW | | `organization_grants_controller.rb:138` | `AdministrationRoster.load` runs on every roster request. | Load amplification. | unified |
| LOW | P | `organization_grants_controller.rb:188-189` | `role_conflict` is acted on before `SessionStore.check!`. | A revoked session gets 409 instead of a revocation error; nothing is written. | unified |
| LOW | | `thread_reads.rb:75`, `:67-77`, `:137-164`; `thread_database_test.rb:128` | Text-sorted timestamp, query built by string substitution, duplicated list/organization_list logic; the cross-org test does not alter the tenant claim. | Maintenance and test strength. | unified |
| LOW | | `apps/server/lib/elevateo/send_worker/smtp_snapshot.rb:202`, `inbound/tls_imap_transport.rb:87` | A v1 reply silently loses In-Reply-To with no comment; a discarded `ImapDeadline` object is built only for validation. | Correctness and documentation. | mailflow |
| LOW | | `apps/server/db/migrate/20261023000043_preserve_mail_reply_identity.rb:10-18` | `down` reinstalls the current `approval.sql`, not the pre-migration version. | Wrong rollback state if that file is edited later. | mailflow |
| LOW | | `apps/server/lib/elevateo/send_api/review.rb` +35; `mail_message_identity.rb:13-19` | An invalid identity raises instead of returning `reply_unavailable`; Message-ID parsing is conservative and drops valid forms without metrics. | Defence in depth and reply availability. | mailflow |
| LOW | | `app_chain_test.rb:56-63,95-101,131-132,141`; `fleet_protocol.py:62-63,71` | Incomplete teardown, polling with no per-call deadline, a non-specific negative assertion, a 50-message fetch cap, unredacted fixture logs, a guard that can never fail. | Flaky or weak evidence; possible synthetic credentials in the evidence directory. | mailflow |

Corrections and refutations: the design reviewer claimed the two Resend routes go to different controllers.
`routes.rb:4` and `:52` both route to `resend_events#create`, so that claim is rejected and not counted.
`fake_inbound_controller.rb` has no route and is test-environment gated.

## Design tradeoffs (dedicated reviewer, analytical simulation only)

1. **Cookie session with hand-checked CSRF header vs bearer tokens.** Keep cookies: bearer tokens stored in
   JS widen the impact of an XSS. Add `before_action :require_csrf!` on mutating requests in
   `ApiController`, and a route-walk test that expects 403 without the token. Scenario: a new controller
   forgets the check, and an XSS or a sibling subdomain can then change state.
2. **Per-controller authorization vs a policy layer.** Add `authorize!` with a fail-closed `verify_authorized`,
   make every API controller inherit `ApiController`, and keep RLS as the second layer. Scenario: a v2
   controller drops org scoping and only an RLS gap remains between users and a cross-tenant read.
3. **Single nginx edge, with Cloudflare forbidden by the owner.** Add `limit_req`/`limit_conn` on auth paths
   and a Postgres-side backoff keyed by email hash. First confirm that `$remote_addr` is the real client IP
   on Railway.
4. **Credential at-rest.** Bundles are 0600 files with strict open checks but are plaintext. Encrypt at the
   application layer with an env-held key before MAIL1019 per-tenant secrets land.
5. **Outbound hold.** It is a good fail-closed control. Enforce it at the last hop in the worker as well,
   require two signals to lift it, and audit who lifted it.
6. **`Timeout.timeout` deadline.** Replace it with cooperative `check!` between steps plus the existing
   per-call timeouts.

## Coverage, hashes, density

Reviewed unique physical LOC (reviewer-reported; E and M overlap on `mail_message_identity.rb`, about 22):
A 340, B 366, C ~360, D 351, E ~413, F 316, G 110, M ~335, H 405, for a total of about **2,996 LOC** (~2,974 unique).
E and H exceeded the 400-line reviewer cap by 13 and 5 lines because of spot checks. This is recorded, not hidden.

Defect counts exclude INFO items and the refuted claim. **Firm defects: 33** (0 HIGH code, 9 MEDIUM including
test gap/latent/design, 24 LOW). **Plausible: 15**, including the HIGH-plausible reply lookup. The 33 firm
defects give 11.0/KLOC; adding the plausible ones gives 48 defects at 16.0/KLOC. The design-level HIGH items
(rate limiting, authorization layering) are architecture gaps and are not counted as line defects.

SHA-256 (first 16 hex characters) of the working-tree files reviewed:

```
9ebf404f973daec4 apps/server/lib/elevateo/google_sso.rb
f6ef3bfa016bb916 apps/server/app/controllers/v1/sso_controller.rb
193feb44903cc32a apps/server/lib/elevateo/session_store.rb
79c60342e0f1e84e apps/server/lib/elevateo/session_crypto.rb
d58c6be0f28dbd02 apps/server/app/controllers/v1/auth_controller.rb
318c1fece463d89f apps/server/app/controllers/v2/admin/organization_grants_controller.rb
f5e1ba5d8bbf3f8b apps/server/app/controllers/v2/admin/organization_role_audit_controller.rb
a48089c2d560b12c apps/server/app/controllers/v2/admin/mailbox_assignee_options_controller.rb
6dcd4224d28fb1fd apps/server/lib/elevateo/tenancy.rb
3722bdf576303d6c apps/server/app/controllers/v1/threads_controller.rb
f8e271f3790415a0 apps/server/lib/elevateo/thread_reads.rb
cd275e775d21b294 apps/server/app/controllers/resend_events_controller.rb
1a10c55feb2ff149 apps/server/app/controllers/v2/resend_provider_events_controller.rb
3a00a4e39d7ab487 apps/server/lib/elevateo/resend_webhook.rb
590edf017d6f84a0 apps/server/app/controllers/v2/fake_inbound_controller.rb
faddb09d8f22cc41 ops/railway/nginx.conf.template
180b2b449dae6892 ops/railway/start.sh
6949d0df7f54cb09 ops/railway/Dockerfile
f4ac7ff2101d72b2 ops/railway/sshd_config
6b6eb901638385de apps/server/lib/elevateo/mail_credentials/binding.rb
fbeed1793c5192da apps/server/lib/elevateo/mail_credentials/bundle.rb
b125b495d6c9ba35 apps/server/lib/elevateo/send_worker/smtp_snapshot.rb
84b43b4d2e1d19e6 apps/server/lib/elevateo/inbound/tls_imap_transport.rb
cfc9951747f3faaa apps/server/lib/elevateo/inbound/imap_worker_store.rb
4ab9e6292e63610e apps/server/app/controllers/v2/outreach/base_controller.rb
88d933c21402df0d apps/server/app/controllers/v2/outreach/campaigns_controller.rb
5f17e19378777ef7 apps/server/app/controllers/v2/outreach/accounts_controller.rb
ad6a5c5d1ed87d2c apps/server/app/controllers/v1/api_controller.rb
3028dec135e71825 apps/server/lib/elevateo/request_deadline.rb
01eb7864205b6edd apps/server/db/migrate/20261023000043_preserve_mail_reply_identity.rb
9bf376a54f64ead4 apps/server/db/migrate/mail_reply_identity/up.sql
5b2eb278522ea962 apps/server/db/migrate/mail_reply_identity/down.sql
5afe0ac6acdb11ed apps/server/db/migrate/mail_reply_identity/snapshot.sql
d28c37424d0f5bcb apps/server/db/migrate/mail_reply_identity/snapshot_down.sql
d021c7f8bde72781 apps/server/lib/elevateo/mail_message_identity.rb
f087702bc2e4c5ce apps/server/lib/elevateo/send_api/canonical.rb
f37ea87417daebe4 apps/server/lib/elevateo/send_api/review.rb
9f4a29449c07072d apps/server/test/support/launch_mailflows/app_chain_test.rb
954cb751718ad1f0 apps/server/test/support/launch_mailflows/fleet_protocol.py
```

## Missing runtime evidence (fleet-02 Docker under the Soren lock; none run by this task)

- RLS policies on `app.mailboxes/threads/messages/thread_stars/thread_read_states` for the API role; `GET /v1/threads` with a revoked member and an ungranted private mailbox; `EXPLAIN ANALYZE` at realistic thread counts.
- A thread with an outbound message followed by a second reply in Mox mode (confirms or refutes the HIGH-plausible finding); migration 43 up/down on a populated DB; lock duration of the intents CHECK.
- `ingest_imap_mail_with_identity` rejecting a NULL lease; the value of `OwnedImapClient::MAX_RESPONSE_BYTES`.
- `docker network inspect` showing `PROJECT_isolated` as internal; a forced cleanup-container failure leaving no `app.env`.
- GoTrue enforcing id_token iss/aud/exp/nonce and email_verified/hd; `enroll_company_identity` domain policy; session rotation in `sessions.establish`; `cookie_secure` true in production; the redaction middleware's real output.
- Campaign `status` PATCH as a non-admin for each enum value; account create with a foreign `mailbox_id`.
- `change_organization_role` matrix (admin→admin, owner target, self, stale revision, concurrent) and a one-row audit write per change.
- `nginx -t`, 503 on the webhook paths at the edge, and sshd `-N` forwarding with `MaxSessions 0`.
- Signature verifier tests for a stale timestamp, multiple signatures, a wrong-length signature, an oversize body and replay.

No production-readiness claim is made. Fixes belong to the existing owners listed above. Root integrates `code-reviews.md`.
