# Google SSO backend preparation — task_8bef3d83f3ab

Application backend implementation only; no public deployment, provider requests, credentials, live email or infrastructure changes were performed by this worker. Frontend and gateway configuration belong to separate dispatches. Final design/proxy review and live acceptance remain pending.

## Browser contract

| Method/path | Result |
| --- | --- |
| GET `/v1/auth/sso/status` | JSON `enabled`, `provider: "google"`, `password_login_enabled` |
| GET `/v1/auth/sso/start` | 303 to configured public Auth `/authorize`; encrypted five-minute HttpOnly/Lax flow cookie |
| GET `/v1/auth/sso/callback` | Exchanges code privately; existing opaque HttpOnly/Strict session; 303 to fixed browser origin `/` |

No arbitrary return URL is accepted. Callback errors redirect to fixed `/?sso_error=access_denied`, `unavailable`, or `invalid_response`. Callback middleware removes the query before Rails logging; the gateway must separately suppress callback query logging. Frontend contract was agreed with dispatch ctx_6eb8e8d11798.

## Security and configuration

Supabase performs Google OIDC; application uses authorization-code PKCE (`s256`) plus encrypted browser-bound random state/verifier. Token exchange uses the existing private, bounded, no-retry Auth transport. Existing token checks and fresh private `/user` attestation precede existing SQL membership authorization/session creation. A missing membership revokes the newly created app session and fails closed. Tokens never enter frontend responses. Supabase consumes each code once; replay regression models that upstream guarantee.

Production SSO requires all of:

- `ELEVATEO_SSO_ENABLED=true`, `ELEVATEO_SSO_ONLY=true`.
- `ELEVATEO_AUTH_PUBLIC_URL=https://mail.elevateoco.com/auth/v1`.
- Existing fixed `ELEVATEO_BROWSER_ORIGIN=https://mail.elevateoco.com` and secure cookie configuration.
- Existing private `ELEVATEO_AUTH_URL` remains unchanged.

SSO-only blocks password login, recovery initiation, and password invitation acceptance before Auth calls. Local defaults retain password tests. Existing sessions are not globally revoked by changing these switches.

Coordinator must supply a Google **Web application** OAuth client ID and secret to self-hosted Auth: `GOTRUE_EXTERNAL_GOOGLE_ENABLED=true`, `GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID`, `GOTRUE_EXTERNAL_GOOGLE_SECRET`, and `GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=https://mail.elevateoco.com/auth/v1/callback`. Configure `API_EXTERNAL_URL` for the public Auth endpoint, fixed app site URL, and allow the fixed application callback with its random state query. Google console redirect URI is the Auth callback, not the app callback. Only Google should be enabled as a social provider; current implementation does not independently attest which social provider produced an otherwise valid PKCE code. That provider-binding tradeoff was escalated for review.

Gateway owner agreed to expose only `/auth/v1/authorize` and `/auth/v1/callback`, mapped to GoTrue `/authorize` and `/callback`. No browser token endpoint is required.

Primary references consulted before implementation: [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [server auth](https://supabase.com/docs/guides/auth/server-side/advanced-guide), [auth-js exchange implementation](https://raw.githubusercontent.com/supabase/auth-js/master/src/GoTrueClient.ts), [self-hosted OAuth configuration](https://supabase.com/docs/guides/self-hosting/self-hosted-oauth).

## Verification receipts

Exclusive fleet-02 Docker lease `/tmp/elevateo-launch-20261023-sso`; no host application execution. Containers use `--rm --network none`, read-only source and no database volumes. Image `elevateo-launch-20261023-sso:checks` was shared with the configuration followup; it later disappeared outside this worker (no image deletion was performed here). Its original logs and baseline comparison remain valid for that frozen image.

- New service: 7 tests / 49 assertions PASS (happy path, bad state, replay, missing membership, expiry/tampering, password guards, query redaction).
- Real Rails/Rack controller: 3 tests / 32 assertions PASS (status/start, cookies, successful callback, fixed errors, logger redaction).
- Existing affected Auth suites: 43 tests / 324 assertions PASS.
- Final config regression: 12 tests / 101 assertions PASS. With the final explicit-openid regression below, affected non-DB evidence totals **65 tests / 507 assertions across scoped runs**, zero failures/errors.
- Lint: eight SSO/affected source-test files PASS; final config source/test pair PASS.
- Full Steep: FAIL, 28 diagnostics across 15 files; exact HEAD baseline in same image has identical diagnostics. No SSO diagnostics. A separate worker owns subsequent baseline repairs; no overall typecheck PASS claimed here.
- Initial combined script also attempted session_logout_cut and refresh_publication: ten cases could not set up without `BE02_TASK_DATABASE_NAME`, zero assertions. Those are NOT passing integration evidence. No SQL changed.
- A final first config invocation failed before tests because frozen Bundler settings were omitted on a read-only mount. Corrected invocation used `BUNDLE_FROZEN=true` and `BUNDLE_PATH=/usr/local/bundle`; results above are from the corrected run.

Raw logs and exact frozen sources remain under the fleet lease directory. Credentials, real Google round trip, deployed gateway logging validation, browser visual acceptance, and overall launch authorization remain with coordinator. Bounded independent review and cleanup receipt will be appended when returned.

## Private OAuth bridge preparation

Coordinator explicitly expanded this task to prepare the pinned nginx two-route bridge and correct
production instructions; nothing was deployed. The separate transport overlay is coordinator-owned.
Primary proxy semantics reference: [nginx proxy_pass](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass).

Distinct lease `/tmp/elevateo-launch-20261023-sso-proxy` tested the actual bridge against a fake Auth
on an internal Docker network. Syntax, exact routes, disallowed paths/method, query/cookie preservation,
fixed host/proto, stripped authorization/forwarding, callback Location/Set-Cookie, no-store/referrer and
query-log suppression PASS. Final proxy disables both access and request error logging (including rare critical errors that can contain request URIs); the exact final configuration passed another rerun. Initial run caught unwritable nginx default temp paths; all compiled temp
paths now use `/tmp`, and the repaired rerun PASS is in `ops/production/auth-proxy-evidence.txt`.
Independent inspect confirms both test containers and internal network absent. No volumes or build
cache were created. The newly pulled pinned nginx image is temporarily retained at coordinator request
for concurrent transport work; no broad prune or persistent-data cleanup occurred.

Confirmed independent source reviews: service 53 LOC, zero defects (0/KLOC); controller 52 LOC and
request tests 99 LOC, zero SSO findings (151 LOC, 0/KLOC). Dedicated design, config and final proxy
review dispositions remain pending; these overlapping counts are not whole-project approval.

Launch requires independent verification that Google is the sole enabled social provider and the
application SSO-only switch is true. Credentials and live verification remain unavailable to this worker.

Final primary-source check of the [GoTrue Google provider](https://raw.githubusercontent.com/supabase/auth/master/internal/api/provider/google.go)
found default email/profile scopes and a legacy user-info fallback. Start now explicitly requests
`scopes=openid` so Google returns OIDC identity material; GoTrue retains its default identity scopes.
One new assertion covers the scope. Final targeted rerun PASS: seven tests / 50 assertions and two-file
lint PASS, using borrowed `elevateo-config-followup:checks` image
`sha256:87dc00d663ef00c7f0fb2408e6ad8f2d5e449388c81b87ef16fb45f7bcdf9833`,
read-only source, network none and disposable containers. Earlier service seven/49 is superseded;
the nonadditive affected suite count is now 65 tests / 507 assertions across scoped runs.
Borrowing is released; the image and its cleanup belong to the configuration worker/coordinator.
The current [redirect validator](https://raw.githubusercontent.com/supabase/auth/master/internal/utilities/request.go)
accepts same-origin redirects including callback state queries; coordinator must verify deployed GoTrue settings without widening origins.

Final independent cleanup inspection again found both task proxy containers and the internal test
network absent. The pinned digest-only nginx image remains present as requested for transport work;
no images/caches were removed by this worker and no reclaimed-byte claim is made. Fleet runs are
Linux Docker, so Windows Docker virtual-disk compaction does not apply to this task.

Proxy follow-up review assessed 138 LOC and found two MEDIUM harness defects (14.49/KLOC): a failed
Docker log read could appear clean, and cleanup failures were suppressed without verifying absence.
Both are repaired: log capture must succeed, exact cleanup failures propagate, checked listings
verify absence, and PASS prints only afterward. Final real proxy rerun PASS; disposable network-none
fake-Docker negative regressions PASS for log failure, removal failure, preflight listing failure and
cleanup listing failure. Preflight itself now requires successful listings before installing cleanup,
so daemon failure cannot be mistaken for an unused name. The first
negative run could not execute its temporary fake binary because tmpfs defaults to noexec; the
corrected run explicitly uses `/tmp:exec` inside that disposable test container. Final evidence is
`ops/production/auth-proxy-evidence.txt`; final independent repair rereview is accepted below.

The nginx image disappeared externally between the earlier inspection and rerun, so Docker pulled
the same pinned digest again. This worker removed no image or cache; coordinator owns its retention.
Residual auth review assessed 200 LOC, zero confirmed defects (0/KLOC); 13 accidentally displayed
additional lines were a procedural review failure and are not counted as accepted coverage.

Coordinator-requested read-only follow-up: [schema initialization assessment](launch-20261023-schema-initialization-assessment.md)
records the existing bootstrap dependency order, live Auth lock/ACL boundary, preservation requirements
and separate tenant membership prerequisite. No database or Auth initialization was performed.

Final coordinator disposition (`msg_7aaa583ce7e8`): independent proxy rereview covered 127 physical
LOC with zero defects (0/KLOC). The two original MEDIUM defects across 138 LOC (14.49/KLOC) remain
recorded as repaired history; overlapping review counts are not additive. Real proxy and all four
negative regressions are accepted. Root owns final integration/documentation, credential setup and
live verification; this dispatch performed no production activation or database mutation.
