# Prelaunch security source review — 2026-10-23

Scope: static source review only. Not a live security certification, not a penetration test, and
not a rerun of any suite. Reviewer: Claude Code session on `claude-fable-5-1` (runtime model ID
reported by the harness; billing tier not independently audited). Task `task_1689d2be7b15`,
dispatch `ctx_83b5859316e1`. No code changed; this file is the only artifact written.

Constraints honored: no Cloudflare proxy/Access/tunnel assumptions, no Google Workspace or MX
changes, no live API calls, no e-mail, no cloud mutation, no laptop tests, no secret reading.
Obsidian knowledge index (`_graphql/knowledge-index.jsonl`) is absent on this machine; no vault
simulation is claimed. Tradeoff simulation below is reasoning from concrete failure scenarios only.

## Coverage table (unique reviewer LOC, physical lines)

| Packet | File | Brief LOC | Actual LOC | Reviewer | Mode |
| --- | --- | --- | --- | --- | --- |
| D1 | `apps/server/lib/elevateo/google_sso.rb` | 53 | 53 | Fable 5.1 (this session) | full read, design tradeoff |
| D2 | `apps/server/app/controllers/v1/sso_controller.rb` | 52 | 48 | same | full read, design tradeoff |
| D3 | `ops/railway/nginx.conf.template` | 54 | 54 | same | full read, design tradeoff |
| D4 | `ops/railway/start.sh` | 29 | 29 | same | full read, design tradeoff |
| | **Total dedicated review** | 188 | **184** | | under the 200-line cap |

Bounded dependency lookups (grep or ≤15-line excerpts, not counted as reviewed LOC, no defects
claimed on them): `auth_input.rb` `query`, `session_crypto.rb` `COOKIE`/`equal?`/`decrypt`,
`auth_callback_redaction.rb` `call`, `config.rb` SSO/origin validation, `auth_controller.rb`
cookie helpers, `api_controller.rb` rescue, `application.rb` hosts/SSL, `routes.rb`, `auth_error.rb`,
`sshd_config` (33 lines, previously reviewed: Transport packet A, 0 defects), `railway.json`,
test method names in `test/be_02/google_sso_test.rb` and `sso_controller_request_test.rb`.
No teammates were spawned: the 20-minute budget was consumed by the dedicated packet, and the
remaining surfaces are inventoried from file names and receipts (section 4), not reviewed.

## 1. Confirmed findings (dedicated packet)

Density: 184 LOC, 1 LOW confirmed defect = **5.43 defects/KLOC**. Zero HIGH, zero MEDIUM.
Overlaps the earlier `task_8bef3d83f3ab` review (53 + 52 LOC, 0 defects); coverage is nonadditive.

| Sev | Path:line | Finding | Reproducible reasoning |
| --- | --- | --- | --- |
| LOW | `ops/railway/start.sh:4` | PORT regex guard is not fail-closed on its own | `[[ … ]] && (( … ))` under `set -e`: a failing `[[` is "a command in an `&&` list other than the last", so bash does not exit; `PORT=abc` or unset PORT proceeds to line 14. The script still fails closed because `envsubst` emits `listen ;`, nginx rejects the config, `wait -n` returns and the script exits 1. The SSH forward (line 15) is already started by then, so the key file exists briefly before teardown. Lines 5–7 are standalone `[[` and do exit. Not exploitable; operational hygiene. |

Rubric pass on the 184 lines (does the code work; null/empty/limits; state coupling; over-engineering;
single purpose; duplication; naming; comments; nesting; tests; docs; input sanitising; authz; hot paths):

- **Works as specified**: start issues verifier/state, encrypts both in a 5-minute `google-sso`
  cookie scoped to `/v1/auth/sso`, Lax, HttpOnly, Secure; callback deletes the cookie first (one-shot),
  validates query allow-list, cookie size, AEAD decrypt with purpose binding, verifier shape, state
  constant-time equality, expiry window (`now < exp <= now+300` rejects forged far-future), code
  charset/length, then exchanges once. Replay is bounded by Supabase single-use `auth_code` plus the
  deleted cookie (`google_sso_test:71`).
- **Null/empty/limits**: nil cookie → `invalid`; nil `state` query → `equal?` false → `invalid`;
  duplicate query keys rejected (`AuthInput.query`); 8 KiB query cap; 2 KiB cookie cap; 1 KiB
  decrypted object cap. `start` uses `api_query` with an empty allow-list, so any query parameter 400s.
- **Open redirect**: none. Both redirects are `browser_origin + "/"` or `"/?sso_error=<fixed enum>"`.
  No `next`/`return_to` parameter exists. `redirect_to` sent to Auth is built from config only.
- **Session/auth boundary**: Google identity without application membership is revoked and denied
  (`google_sso_test:77`); `replace_caller` clears the caller on failure; config forbids production SSO
  without SSO-only and the exact public Auth URL (`config.rb:92`), closing password/recovery as an
  alternate path. The launch assessment correctly keeps tenant enrollment a separate blocker.
- **Logging**: `AuthCallbackRedaction` blanks `QUERY_STRING`/`REQUEST_URI` before the Rails logger
  for the callback path; nginx `access_log off`; `Referrer-Policy: no-referrer` on both hops.
- **Client-forwarding spoofing**: nginx overwrites `X-Forwarded-For`, `Forwarded`, `X-Forwarded-Host`,
  `X-Forwarded-Proto` and `Host` with fixed values on both upstreams; Rails `config.hosts` is exact and
  `assume_ssl`/`force_ssl` are on. A client cannot inject a trusted proxy header through this edge.
- **Host/key trust**: `StrictHostKeyChecking=yes` with a pinned `known_hosts`, `IdentitiesOnly`,
  `BatchMode`, `ExitOnForwardFailure`; server side `PermitOpen` is limited to the two upstreams,
  `ForceCommand /bin/false`, `MaxSessions 0`, no TTY/agent/X11/tunnel/remote forwards.
- **Least privilege**: Railway image runs as `node`; secrets decoded under `umask 077` into a 0700
  dir and the env vars are unset before children start; nginx temp paths are under `/tmp`.
- **Tests**: 7 service + 3 request tests cover happy path, bad state, missing cookie, replay, no
  membership, expiry, wrong cookie, duplicate query, disabled/password-only guards, redaction, cookie
  attributes, fixed redirect. Documented in `launch-20261023-google-sso.md`.
- **Names/comments/size**: all four files are single-purpose; AIDEV notes explain why (Lax, nonce
  ownership, single-use code, error_log choice). No duplication, no deep nesting, no hot-path queries.

## 2. Design tradeoffs with concrete failure scenarios (unverified hypotheses, not defects)

| # | Decision | Scenario simulated | Assessment |
| --- | --- | --- | --- |
| T1 | `error_log /dev/null crit`, `access_log off` (nginx:4,9) | Transport drops at 03:00; every request 502s for 45 s until `ServerAlive` kills ssh; operators see only Railway restart counts and `/ready` failures, no request-level evidence; abuse (credential-stuffing on `/auth/v1/authorize`) leaves no edge trail. | Deliberate privacy choice (OAuth codes in URLs). Acceptable for launch if Rails/Supabase logs are the forensic source. Recommend: keep, but document that edge-level abuse forensics are unavailable. |
| T2 | `X-Forwarded-For` stripped (nginx:33,45) | Anti-spoofing is correct, but upstream rate limiting per client IP is impossible; no `rack-attack` or equivalent present (grep: none). A single bot can hammer `/v1/auth/sso/start` (cheap: two random tokens + AEAD) and `/auth/v1/authorize` (GoTrue). | Correct security direction; residual is availability, not confidentiality. Hypothesis: Railway edge rate limits are the only throttle. If per-IP limiting is ever wanted, it must be an nginx `limit_req` on `$remote_addr` at this layer, never by trusting a header. |
| T3 | `restartPolicyType ON_FAILURE`, `MaxRetries 3` (railway.json) | fleet-02 reboot for 10 minutes: three fast restarts exhaust retries and the service stays down until manual redeploy. | Fail-closed by design (secrets are server-only); accept for a held launch, revisit before public traffic. |
| T4 | No `Content-Security-Policy` anywhere (grep over `ops/railway`, `apps/web/index.html`, server config: none) | A future XSS in the SPA could exfiltrate thread content; session cookie is HttpOnly/Strict so token theft is blocked, but same-origin fetches from injected script still succeed. | **Recommended before public launch** (MEDIUM hardening gap, not a defect in reviewed lines): add a strict CSP (`default-src 'self'; frame-ancestors 'none'; form-action 'self' https://mail.elevateoco.com`) at nginx:17–21. Root-owned. |
| T5 | HSTS without `includeSubDomains`/`preload` (nginx:20) | Attacker lures to `http://x.mail.elevateoco.com`; cookies are host-only so none leak, but a phishing landing is not blocked by HSTS. | Minor; add `includeSubDomains` once no HTTP-only subdomain exists. |
| T6 | `X-Forwarded-Proto https` hard-coded (nginx:31,43) | If Railway ever exposed a plain-HTTP port, Rails would believe TLS and set Secure cookies that the browser drops; login silently fails. Fail-safe, not fail-open. | Acceptable; depends on Railway forcing HTTPS (unverified here). |
| T7 | `state` carried in `redirect_to` query to Supabase Auth | Supabase `URI_ALLOW_LIST` with an exact entry rejects `…/callback?state=…`; the flow 400s at Auth before any code is issued. | Fail-closed; requires a wildcard allow-list entry. Verify at activation (cloud read, not source). |
| T8 | 12 h `elevateo_session` on SSO success (sso_controller:31) vs 5 min flow cookie | Stolen laptop with open browser retains access for up to 12 h unless server-side revocation is used. | Consistent with password path; revocation exists (`auth_revocations.rb`). Accept. |
| T9 | `rescue Elevateo::AuthError` only (sso_controller:34) | Any non-`AuthError` exception (`RequestDeadline::Expired` is a `StandardError`; `auth_client.rb` converts HTTP/deadline failures to `AuthError`, grep lines 17–84) would render the Rails 500 page instead of `?sso_error=unavailable`. | Hypothesis only: whether `Expired` can escape `exchange_code` was not traced. Impact is UX and a generic 500 body, not credential leakage (redaction already blanked the query). |

## 3. Launch blockers from this review

None in the four reviewed files. Pre-existing, root-owned blockers confirmed by receipts, not by this
review: tenant/organization membership provisioning (launch assessment §"Tenant authorization");
Google OAuth credentials absent; outbound hold; Supabase redirect allow-list shape (T7).
Recommended-before-public-traffic hardening: CSP (T4), restart policy (T3).

## 4. Remaining attack-surface inventory (names and receipts only; NOT reviewed here)

| Surface | Files | Existing receipt | Priority for a ≤200-LOC packet |
| --- | --- | --- | --- |
| Auth, password, logout, challenge, CSRF | `v1/auth_controller.rb`, `v1/sessions_controller.rb` (Origin check at :24), `v1/write_controller.rb` (`WriteInput.transport!` Origin pinning), `auth_entry.rb`, `auth_tokens.rb`, `auth_revocations.rb`, `session_*.rb` | BE02 suites; `code-reviews.md` ADV/Config packets; fleet gate 205 suites / 1169 runs / 13577 assertions (`config-followup-20261023/verification.md`) | High: dirty-tree changes to `sessions.rb`, `auth_client.rb`, `auth_entry.rb`, `auth_input.rb` are unreviewed since the last receipt |
| Authorization / tenancy / RLS | `tenancy.rb`, `session_organizations.rb`, `v2/admin/organization_grants_controller.rb` (dirty), `db/be02_*/policies.sql`, `db/be02_memberships/tables.sql` | Vera ADV131 admin grants; BE-05 star RLS | High: grants controller is dirty |
| Uploads / download | `draft_attachment*.rb`, `attachments_*.rb` (scan, storage, download, gateway), `v2/inbox_attachments_controller.rb` | Vera ADV133 attachment controller; `client_max_body_size 26m` at edge | Medium |
| Ingestion | `inbound/` (`fake_ingress.rb`, `imap_mime_tree.rb`, `imap_poll_store.rb` all dirty), `v2/fake_inbound_controller.rb`, `resend_webhook.rb`, `resend_events/` | Edge returns 503 for both provider webhook paths (nginx:24–25); edge 46 tests | Medium: MIME tree parser is dirty |
| Send / consent / suppression | `send_api/`, `send_worker/` (`drain.rb`, `resend_transport.rb`, `smtp_snapshot.rb` dirty), `send_*_controller.rb`, `db/be03_send/budget_schema.sql`, `campaigns/`, `outreach_sequence/` | Outbound hold enforced in config (`outbound_hold`); BE03 receipts | Medium while hold stands; High at activation |
| Secrets | `config.rb` (typed, validated), `start.sh` (unset after decode), `database.yml` (dirty; Config follow-up Unicode/YAML repairs), `Dockerfile` pinned digests, non-root users | Config follow-up 3 packets, 0 open defects | Low |
| Frontend plaintext / URL / callback / privacy | `apps/web/src/data/ssoContract.ts`, `http/httpGateway.ts` (dirty), `features/auth/SignInPage.tsx` (dirty), `app/Shell.tsx` (dirty), `features/help/content.ts` | Web 1063 + 29 targeted + 10 browser; `SignInPage.sso.test.tsx`; `sso_error` enum validated client-side | Medium: no CSP (T4); dirty sign-in page |
| Dependency / container exposure | `Gemfile` (Rails 8.1.4, pg, puma 7, net-imap 0.6.7, nokogiri 1.19.4), server `ruby:3.4.11-slim` digest-pinned, `USER 10001`; Railway `node:24.21.0` digest-pinned, `USER node`, `server_tokens off` | Admission digest gate (Config follow-up) | Low; no SCA/advisory scan receipt found — unverified |

## 5. Explicit gaps

- No teammate packets were run; everything in section 4 is inventory, not review.
- Dirty working-tree files listed above have no post-change review receipt; their last receipts
  predate the current modifications.
- Supabase Auth configuration (redirect allow-list, PKCE enforcement, provider restrictions, hosted
  domain restriction to the Workspace tenant) is cloud state and was not read.
- Railway TLS enforcement, edge rate limiting and the actual `PORT` binding were not observed.
- Runtime behavior of T9 (non-`AuthError` escape) was not traced through `auth_client.rb`.
- No dependency advisory scan receipt was located.

## Coordinator resolution

The LOW startup-port finding is repaired with explicit bounded canonical decimal validation for
both PORT and FLEET_SSH_PORT before secret handling. Fleet Docker: 234 assertions PASS;
independent review: 156 physical LOC, zero defects (0/KLOC). See the edge follow-up receipt.
Remaining hardening observations and live-security gaps above are unchanged.
