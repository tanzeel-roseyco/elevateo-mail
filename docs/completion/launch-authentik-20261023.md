# Authentik backend SSO — 2026-10-23

Status: backend implementation complete; Ruby, SQL initializer/enrollment and real GoTrue checks pass, with final regression review pending. Production activation remains held pending independently verified Tanzeel identity and dedicated identity configuration. No live login, email send, Authentik mutation or public release is claimed.

## Implemented behavior

The existing `/v1/auth/sso/*` routes and internal `GoogleSso` name remain compatible. `ELEVATEO_SSO_PROVIDER` permits `google` or `custom:authentik`. The encrypted five-minute browser flow binds the chosen provider, state and S256 PKCE verifier; provider changes and old unbound cookies fail closed. Sessions still come from GoTrue, with private `/user` attestation and existing membership, expiry, rotation and logout behavior. An enrollment denial logs out the newly exchanged session.

`/.well-known/elevateo-authentik` provides pinned HTTPS Authentik discovery with RS256 and S256, deliberately omitting userinfo. Configure the dedicated GoTrue custom OIDC provider to use this discovery URL: v2.196.0 verifies supplied ID-token signature, issuer and audience, and the missing-token fallback cannot proceed without a userinfo endpoint. This requirement is mandatory; using ordinary upstream discovery would restore the unsafe fallback. The endpoint is no-store and unavailable while Authentik SSO is disabled.

Every authenticated GoTrue `/user` result in Authentik mode must contain exactly one `custom:authentik` identity with a UUID subject, verified current company email, and matching GoTrue email. A bounded HTTPS Authentik API lookup then checks the exact UUID, active status, current email, address-bound `email_verified_address`, and the configured tenant group UUID. No positive cache hides upstream deactivation or group revocation. The lookup has a two-second deadline, bounded JSON body, no environment proxy, retries or redirects, and deliberate network/TLS failure handling. Runtime configuration rejects missing or malformed HTTPS per-provider issuer, group UUID and API token.

The first-owner initializer now requires a nonzero immutable Authentik subject, verified custom-provider identity, company email and explicit trusted approval flag `verified_first_owner_is_tanzeel_ahmad`. No Railway/display-name inference exists. Enrollment only adds associates to the pinned tenant after a matching existing owner/subject check; it never bootstraps admin. Session, owner-membership and policy locks serialize concurrent revocation. The installer is intentionally one-shot: use the reviewed root-only `remove.sql` before replacement, preserving tombstones and disabling policy until reapproval.

## Read-only infrastructure findings and remaining activation work

SSH `hetzner-platform` is `platform-fleet02`; `/opt/eos-apps/authentik/docker-compose.yml` server/worker are healthy Authentik 2026.8.3. Public issuer origin is `https://auth.os.elevateoco.com` behind existing Traefik. No dedicated Elevateo Mail OAuth provider/application or named Tanzeel user exists. None of eight active internal users had nonempty `email_verified_address` matching its current email. Existing constant-true email mapping is unsuitable and was not reused. No secrets, private keys or environment values were exported.

Create a dedicated confidential OIDC provider with UUID subject mode, per-provider issuer, existing RSA signing certificate, exact callback `https://mail.elevateoco.com/auth/v1/callback`, address-bound verified email mapping and a held empty access group. Provision a least-privilege API reader for the current-user lookup; do not use a broad admin token. Supply genuine Tanzeel Ahmad/current company-email proof and pin subject, GoTrue owner UUID, organization and group from trusted evidence. None is guessed by this worker. Keep SSO, signup and enrollment disabled until root accepts those receipts.

Existing shared GoTrue v2.186.0 is unsupported for custom OIDC and remains untouched. The dedicated stack must use the separately pinned v2.196.0 image, `custom:authentik`, `provider_type: oidc`, exact issuer/client audience and the strict app discovery URL. The shared Authentik/Workspace services were not changed. Missing genuine identity proof is an external activation blocker; the code does not manufacture verification.

## Validation and failed history

All execution occurs inside fleet-02 Docker under `/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock`, with internal disposable networks and task-owned resources only.

- Ruby v3: eight isolated auth suites passed, 59 runs / 456 assertions / zero failures, errors or skips; scoped Steep exit 0 and RuboCop `--lint` 12 files, zero offenses. Exact result counts and logs are attached in the evidence directory.
- Ruby v2: 59 runs / 462 assertions / zero test failures, but Steep found two nullable-URI typing errors. Both were corrected; v3 is the accepted type result.
- Earlier affected config/SSO 27 runs / 193 assertions and isolated auth 46 / 320 passed. Earlier broad single-process fixture failure and baseline style lint failure remain historical, not passing evidence.
- Earlier SQL plan/enrollment/harness gate passed 19 tests. Review subsequently identified a session-deletion race; the repair adds a row lock and two-connection deletion/expiry regressions. Initializer v2 passed all 14 tests. Enrollment v3 passed all 21 tests, including an explicit pg_blocking_pids barrier proving both session-deletion/expiry ordering cases. Exact task cleanup passed.
- Earlier SQL staging missed fixture source slices and failed before tests. Initial 120-second SQL admission expired waiting for the shared flock, with no Docker mutation; bounded 600-second retries follow.

Scoped buildx builder/image removal passed after Ruby v3; fleet free space was 71,330,693,120 bytes afterwards. This is available space, not a claimed image-reclamation delta. SQL cleanup verified exact task container/network absence and tmpfs removal. GoTrue v8 passed three tests including signed-token login, wrong PKCE followed by correct exchange, missing/signature/issuer/audience/state rejection, and an otherwise usable userinfo fallback control. Its logs record the actual cryptographic rejection reasons; v9 also passed all three tests with persisted-session-count unchanged after every rejected callback and exact bad_code_verifier assertions. Exact container/network cleanup passed. The isolated internal fixture subnet uses globally numbered addresses solely to exercise unchanged GoTrue SSRF protection; it exposes no host ports and has no external route. Shared images, services and persistent data remain retained; no broad prune occurred.

## Review and ownership

Root dispatches bounded read-only functional and design review, each packet at most 200 lines. Identity functional review found one TLS-error handling defect (1/219 LOC, 4.57/KLOC), repaired and independently rechecked; design review requested a same-verifier revocation regression, now included. SQL review found a session race and a repeat-install concern; the locking repair and explicit remove-first installer contract have regression tests and require fresh bounded review. Details and density remain in the separate review reports and `code-reviews.md`; no whole-project approval is claimed.

Worker-owned sources are enumerated with SHA-256 and line counts in `launch-authentik-20261023/source-manifest.json`. They comprise backend auth/config/discovery/RBS/tests, assigned initialize and launch-controls SQL/tests, and the isolated GoTrue OIDC fixture. No frontend writes or commits were made. README/state/documentation and final acceptance remain coordinator-owned. Existing dirty work is preserved. The actual Obsidian connection was unavailable to this dispatched worker; no vault synchronization or external tradeoff simulation is claimed.

## Sources

- [Supabase self-hosted custom OIDC](https://supabase.com/docs/guides/self-hosting/self-hosted-custom-oauth-providers)
- [Pinned GoTrue v2.196.0 custom OIDC implementation](https://raw.githubusercontent.com/supabase/auth/v2.196.0/internal/api/provider/custom_oauth.go)
- [Authentik address-bound email verification](https://docs.goauthentik.io/add-secure-apps/providers/oauth2/verify-email-address/)
- [Authentik OAuth2 provider](https://docs.goauthentik.io/add-secure-apps/providers/oauth2/)
## Operator configuration handoff

Set ELEVATEO_SSO_PROVIDER=custom:authentik, ELEVATEO_AUTHENTIK_ISSUER to the exact dedicated HTTPS per-provider issuer, ELEVATEO_AUTHENTIK_GROUP to the approved tenant group UUID, and ELEVATEO_AUTHENTIK_API_TOKEN through the secret store only. Existing SSO enablement remains held. The GoTrue custom provider must pin the confidential client ID and exact issuer, use PKCE, and override discovery to https://mail.elevateoco.com/.well-known/elevateo-authentik. Never use the ordinary userinfo-enabled discovery document for this integration.

Accepted evidence: auth-v3.log (59/456 plus Steep/lint), initializer-v2.log (14 tests), enrollment-v3.log (21 tests), and oidc-v9.log (3 real GoTrue tests). fleet-oidc-harness.sh records the exact task-owned fixture invocation; it is evidence, not a production installer. The v7 fallback-control failure exposed issuer-keyed discovery caching; the independent control now has a distinct issuer. Earlier v1-v5 setup/private-address failures and v7 failure are not passing evidence. All test accounts, keys, certificates, passwords and tokens were disposable fixture values. Production identity proof remains absent.
