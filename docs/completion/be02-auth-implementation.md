# BE-02A authentication implementation snapshot

Status: bounded implementation supplied for coordinator integration; **tests, lint,
typecheck, Docker and real Auth acceptance NOT RUN** by this worker. No commit,
push, deployment, SSH, Docker resources, new dependencies or additional agents.
This report does not claim application completion or production acceptance.

Source checkout: `Elevateo Mail - BE02 Auth`, branch `feature/codex-be02-auth`.
Task `task_0813d6401b54`, dispatch `ctx_23a831b03356`.
Canonical `contracts/v1/openapi.json` SHA-256:
`f6524b78e870d9af7e6b8c38bda9a327c3d05c8e2c974ef450db489d31c2a7e4`.

## Implemented boundaries

- Internal Auth client has fixed paths, no redirects, no proxy inheritance or
  automatic retries, 500 ms connection and 2 s total exchange caps, 64 KiB
  response limit, deliberate rejection/transient classification and an ambient
  transaction guard. The enclosing controller owns a shared 10 s deadline.
- JWT shape, algorithm, issuer, audience, expiry, UUID subject and nonmissing
  session ID are checked. Token envelopes require bounded refresh credentials,
  bearer type, 1..3600-second expiry and consistent user ID. Trusted `/user`
  attests access tokens; this is not independent cryptographic JWT verification.
- Random 256-bit cookies are stored as SHA-256 digests; credentials use AES-256-GCM
  with purpose-specific authenticated data and a dedicated typed configuration
  key. Challenge HMACs bind current session and staged-entry cookies plus exact
  configured Origin. No public signup or arbitrary Auth proxy exists.
- Login/recovery validate duplicate/unknown/body-byte boundaries before DB/Auth
  work and call PostgreSQL-backed normalized email/IP rate limits. Login replaces
  the caller and selects the organization through the DB facade. A no-membership
  identity retains its cookie but receives generic 404.
- Refresh claims persist before the one upstream call. Publication passes claim
  and generation for SQL compare-and-set; uncertain claims are not stolen or
  retried. No expired-access-JWT precheck blocks explicit refresh. SQL owns 12 h
  absolute/30 min idle policy and late-publication revocation intent.
- Logout validates browser intent locally, commits local/global bound-user
  revocation and durable intent before any Auth call, clears session/challenge,
  and honestly reports pending remote status. Worker reconciliation records
  failure rather than treating remote 401 as proven completion.
- Callback GET stages an encrypted invite/recovery hash without verifying it,
  strips callback query from downstream request logging, and redirects 303 to
  fixed `/auth/complete`. Explicit POST uses a durable claim, sets password before
  local access, supports known password-rejection retry from password_pending,
  and makes ambiguous verification terminal. Replayed completion is denied.
- Session presentation, organization pagination and switching use the canonical
  shapes. Signed cursors bind actor/context/version/query/expiry. Switching passes
  expected context and generation into the DB's atomic membership/CAS boundary.

`SessionStore` uses only allowlisted EXECUTE function names and bound parameters;
statement timeout is capped at 3 s and lock timeout at 1 s, both clipped to the
remaining request deadline. It rejects ambient transactions except explicitly
shared authorization/list read snapshots. HTTP runs outside those snapshots.

## Exact DB integration

Use the sibling `Elevateo Mail - BE02 Codex` artifact
`docs/completion/be02-session-database-interface.md`, dispatch
`ctx_de61578a102c`. No competing schema or SQL implementation was created here.
The function signature map in `SessionStore::FUNCTIONS` follows that artifact.
In particular, organization switching requires the latest **eight-argument**
interface: digest, verified user, verified sid, target organization, new context,
new CSRF, expected old context, expected generation. The DB worker added these
last two arguments after the concurrent-switch race was identified.

`authorize_session` and `list_organizations` are the only facade functions allowed
inside the root-owned repeatable-read, read-only protected snapshot. Session
resolution occurs before Auth; touch occurs in a separate short transaction after
successful authorization. Read controller integration must retain this ordering.

## Coordinator wiring (not edited here)

Routes:

```ruby
get "/auth/accept", to: "auth_entries#stage"
namespace :v1 do
  get "auth/login-challenge", to: "auth#challenge"
  post "auth/login", to: "auth#login"
  post "auth/recovery", to: "auth#recovery"
  post "auth/refresh", to: "auth#refresh"
  post "auth/logout", to: "auth#logout"
  post "auth/accept", to: "auth#accept"
  get "session", to: "sessions#show"
  post "session/organization", to: "sessions#switch_organization"
  get "organizations", to: "organizations#index"
end
```

Load callback middleware explicitly before logger installation:

```ruby
require_relative "../lib/elevateo/auth_callback_redaction"
config.middleware.insert_before Rails::Rack::Logger, Elevateo::AuthCallbackRedaction
config.filter_parameters += %i[email password token token_hash access_token refresh_token]
```

`AuthEntriesController` fails closed when the middleware's private raw-query slot
is missing. Reverse proxy/access logs must also omit callback query strings;
Rails middleware cannot redact logs emitted before Rails. Verify actual Rails
instrumentation does not preparse or log raw bodies ahead of the boundary, and
apply the root-owned HTTP body/URL limits before controller parameter handling.

`V1::ReadController` inherits `V1::ApiController` and supplies:

```ruby
protected_read(allowed_query:, context_required: true, budget: 2_097_152) do |connection:, identity:, session:, query:, deadline:|
  # Authorize and serialize entirely inside the protected snapshot; return a JSON String.
end
```

Use `read_config = Elevateo::Config.current` and
`read_sessions = Elevateo::Sessions.new(config: read_config)` as root-owned helpers.
`authenticate(cookie:, deadline:)` returns `SessionIdentity` with `user_id`,
`org_id`, `auth_session_id`, `digest`, `display_name`, and `metadata`.
`authorize(identity, context:, version:, deadline:, connection:)` returns canonical
Session; `touch(identity, deadline:)` performs the separate idle-policy touch.
GET session bootstraps with `context_required: false`, budget 16384.
Organization index budget is 131072; lifecycle responses 20480; errors 4096.

The existing worker process must poll the supplied reconciler using its worker
DB role, outside any other transaction:

```ruby
Elevateo::AuthRevocations.new.run_once(deadline: Elevateo::RequestDeadline.new)
```

It claims at most one intent per poll; SQL owns claim expiry, bounded retry/backoff
and visible terminal failure. No independent worker infrastructure was added.

Runtime API/worker environment additions:

| Setting | Required value |
| --- | --- |
| `ELEVATEO_SESSION_KEY_BASE64` | Dedicated disposable random 32 bytes, strict base64, ignored secret input |
| `ELEVATEO_BROWSER_ORIGIN` | Exact application origin; no path, userinfo, query or fragment |
| `ELEVATEO_COOKIE_SECURE` | `true` on HTTPS; `false` only for explicit isolated local HTTP |
| `ELEVATEO_LOCAL_HTTP` | `true` only when using the isolated HTTP profile |
| `ELEVATEO_AUTH_JWT_ISSUER` | Actual pinned Auth issuer, distinct from internal network destination |
| `ELEVATEO_AUTH_JWT_AUDIENCE` | `authenticated` |
| `ELEVATEO_AUTH_JWT_ALGORITHM` | `HS256` |
| `ELEVATEO_AUTH_PASSWORD_MINIMUM` | `12` |

Migrator does not require or use auth-specific settings. API/worker environment
must exclude JWT signing/service-role/admin keys, including inherited compose
settings. `Config#cursor_signing_key` supplies the mailbox worker a domain-separated
32-byte HMAC derivative. Root must configure pinned Auth site/callback URLs,
restricted redirects, password/JWT/timebox policies, Mailpit and outbound hold.

Strict RBS files are supplied, **not typechecked**. Root owns adding required
stdlib libraries to Steep (`json`, `openssl`, `base64`, `digest`, `timeout`,
`ipaddr`, `securerandom`, `time`) and implementing the missing Rails/ActiveRecord
framework seams. The existing Steepfile references a missing `rails_seams.rbs`.
`_SessionConnection#exec_query` expects enumerable result hashes rather than the
foundation `_TenantConnection` void placeholder; reconcile these concrete seams.
The Rack env signature has one documented `untyped` because it carries streams
and framework objects; auth/domain payloads use recursive JSON types.

## Authored validation and remaining acceptance

42 test methods across eight test files, plus a shared deterministic helper:
HTTP fixed paths/no retries/malformed replies/transaction guard; ciphertext
authentication and challenge binding; JWT/sid/token envelopes; config errors;
two concurrent refreshes; logout racing late refresh; transient failure terminal
state; expired-access refresh; local logout despite Auth outage; switch CAS hints;
callback non-consumption/redaction/replay; uncertain verify and password retry;
worker honest acknowledgement; organization cursor validation; bound SQL values
and clipped timeout caps. Fake stores test Ruby state decisions, not SQL races.

Suggested command **inside the coordinator's disposable Docker environment**:

```sh
bundle exec ruby -Itest -e 'ARGV.each { |path| require_relative path }' test/be_02/auth_client_test.rb test/be_02/auth_config_test.rb test/be_02/auth_entry_test.rb test/be_02/auth_revocations_test.rb test/be_02/session_lifecycle_test.rb test/be_02/session_organizations_test.rb test/be_02/session_security_test.rb test/be_02/session_store_test.rb
```

Still required: lint, syntax/RBS/type checks, unit execution and any repairs;
actual Rails routing/cookie/error/deadline/request-logging integration; pinned Auth
issuance, signup denial, real generated invite/recovery links and `/user` policy;
real-role PostgreSQL/RLS/grant/timeout/concurrency/crash tests; lifecycle contract
and browser/UI acceptance. Dedicated adversarial/design review and coverage,
defect count/density recording in root `code-reviews.md` remain coordinator-owned.
No Docker cleanup was necessary because this worker allocated no Docker resources.

All 46 owned code/signature/test files are under 200 lines each. The table below
is the exact integration manifest; Config is the only pre-existing owned code
file amended, while the existing unrelated BE01 overlay is preserved.

## SHA-256 integration manifest

| Owned path | Lines | SHA-256 |
| --- | ---: | --- |
| apps/server/app/controllers/auth_entries_controller.rb | 17 | f9df1cb997a01dc3cb40d9171938deb6de29f8029cf837661acab34f77abed7d |
| apps/server/app/controllers/v1/api_controller.rb | 66 | 13394057005c8fa546619cba2849c44355660f8c71c98fcf3a14e36bd0f81635 |
| apps/server/app/controllers/v1/auth_controller.rb | 96 | 02f51808c91c8fb99ab4a7a4016d00985e4d717ec27479fbb5d5c7f21bf3192b |
| apps/server/app/controllers/v1/organizations_controller.rb | 16 | 8237a4a95257d408b62bc581c9eb3b2404aeb57eeb1583958c3be0f51dc49b37 |
| apps/server/app/controllers/v1/sessions_controller.rb | 31 | f8b0dcfdaacbf15d24faa9dfde8afdb221199e9a89d23bc461abdf4cbb506d63 |
| apps/server/lib/elevateo/auth_callback_redaction.rb | 19 | 65a851476fd527b61e2b1a9a5efdd451f0f622352fca75592646a78c772f73e2 |
| apps/server/lib/elevateo/auth_client.rb | 106 | e8a840afe13486537ea67de6882de2a06d440b1236fb2b249f7b838e42597547 |
| apps/server/lib/elevateo/auth_entry.rb | 77 | 53ed27ccd3144d12798b2ea685e3163319320167173b2eb90814984aba758859 |
| apps/server/lib/elevateo/auth_error.rb | 21 | 98307297c57f7cafdd254d5e53b993f2cee621642cb6656016162065369fae86 |
| apps/server/lib/elevateo/auth_input.rb | 71 | e539c594c75541571f4081ea4a05e400c8dc62e68b5372cde949e21426716b0f |
| apps/server/lib/elevateo/auth_revocations.rb | 34 | 6e341ba7ae71c093eb6420c0af73aaa0e3c7ed0dfb261a509934da8b4651d1d5 |
| apps/server/lib/elevateo/auth_tokens.rb | 66 | ed6f922a6fcb5515e40f8afa164ce797920ad6a4d39599e3f71f01dc4a7e95b9 |
| apps/server/lib/elevateo/config.rb | 102 | 5d062c1de9978ff249755e3722f23045b234fa8280d136cb259fcdbf1c8f9312 |
| apps/server/lib/elevateo/request_deadline.rb | 30 | 54850453cb28826a66ae0e9faf33c7194d120dcd7eb4c6490e59b8e39879f3ad |
| apps/server/lib/elevateo/session_challenges.rb | 41 | 35f8f2f9f96e71c26c2b392d7ba34fea0ad915c4f5b25ebe962ec8e4970a6b3b |
| apps/server/lib/elevateo/session_crypto.rb | 56 | bb7fc0f5818ebc9b8dd4efe411ab006ca7ba7933a4634d9ec6961260b6714f20 |
| apps/server/lib/elevateo/session_organizations.rb | 59 | 31f6207282e1dc2179245a9de5e05950c261c83d52fbc4440834db74e62b4251 |
| apps/server/lib/elevateo/session_presentation.rb | 46 | cd23d39d32fa42deecbb544f893cbba2efffa32bd533c538cf986ac7f97cea5c |
| apps/server/lib/elevateo/session_store.rb | 79 | 0a5f005a868d75370f9c6b8e82948a652849af964bfda4d8d9d756508fd3185c |
| apps/server/lib/elevateo/sessions.rb | 141 | 5ba17f38f92429e2b5ad24ce860b1a8e42c61896fa76e8d8a52d76874bf44691 |
| apps/server/sig/auth_callback_redaction.rbs | 13 | cde650d9ee688f9087473853443ed749b15cf415488361f4dcfbd6a29ddd70b7 |
| apps/server/sig/auth_client.rbs | 24 | eec4e390cd863f62b2ec186881272d34205d4fa95087dcf09beeb84fe0ad850f |
| apps/server/sig/auth_controllers.rbs | 51 | 0480c9bea76c36069bf3a5a2abd4a7747825eaad906c64d8de3b86ed955dda3c |
| apps/server/sig/auth_entry.rbs | 15 | e59afc6a2a859e9e4e1a5067beb7017fa22bb984437edc599e0d8cdcf7fb10bc |
| apps/server/sig/auth_error.rbs | 12 | deae4ef751c7f297acd937bf0793ba2730100fd093afd67a8b12c5581dcba14f |
| apps/server/sig/auth_input.rbs | 16 | 063cd1991daeb7fca9148b950c661012b87d9913ea358ed05e7fb3213ffa081f |
| apps/server/sig/auth_revocations.rbs | 9 | f8925138ef927b71985614c4ea643d07c6bc9b89dae9dbfec367921d5efe7f4d |
| apps/server/sig/auth_tokens.rbs | 29 | 635ffcf925fab9ea4a984b8cefbbfc95ecafb6b0896dbad67685106bdb171cfd |
| apps/server/sig/auth_types.rbs | 43 | 0a3bf79deb26a8c923fd1ed26045fcd986563759eb78c95d6b8dc899951195ea |
| apps/server/sig/config.rbs | 42 | 7e6ded031203193ed2019722c06b978dfce2dc511cb02bd3e6b168e234b95a77 |
| apps/server/sig/request_deadline.rbs | 13 | 91443644ae9fd3575a675fdd03ac433f54541efed0b5b8c050d166617401ad6f |
| apps/server/sig/session_challenges.rbs | 11 | 6a93fa81f03461027ce82204dffd2a4d14552236811f9eebe6102103ed653be7 |
| apps/server/sig/session_crypto.rbs | 14 | eb2e96ca0ca32d1ec5a66564e5e77231aa939643877da7142f2deb766d4781a8 |
| apps/server/sig/session_organizations.rbs | 13 | 204afd5559d5d38330f325b62da03dc1dc7b251bf22a6504fd97683a392765e8 |
| apps/server/sig/session_presentation.rbs | 28 | 082aaf8915814e3b815e717a3fda7a3452441ffa0f3dd1849a4f29f99614a5ec |
| apps/server/sig/session_store.rbs | 13 | 61cf15544b1ec433a78efd36e21510d609cb469dfd98b5e1b23b463299675ee2 |
| apps/server/sig/sessions.rbs | 27 | b4a9eef6a8e8944f162010ff7f94907f3908976e75085aef8721dfa6e678755a |
| apps/server/test/be_02/auth_client_test.rb | 53 | 79916351c8750a772bc5ef3a9daa6c9c24b2b0007d669100148e69c290d93a67 |
| apps/server/test/be_02/auth_config_test.rb | 57 | 4fdb8b9ba3354beb235dd0960b92a43c9251657823ecf2a508885cd3bee57bfb |
| apps/server/test/be_02/auth_entry_test.rb | 80 | ef8b60d1b64902175b748e3361dcd3d8b9a7cb58a2a8a7858773b67c23c0b438 |
| apps/server/test/be_02/auth_revocations_test.rb | 43 | 26bba879f805358ed9210bd4d0fe2fe60972e6abc65d22d67cf1247d1f6b43b0 |
| apps/server/test/be_02/auth_test_helper.rb | 147 | eb9a1ace881abf20e2415042b102f2a770236bc92796e258caa8d7bdcee67821 |
| apps/server/test/be_02/session_lifecycle_test.rb | 121 | c0489e1c4d4eded240ebc338742e491564c7b2fa26e427fc2da2fd48cea5abd0 |
| apps/server/test/be_02/session_organizations_test.rb | 52 | 901cf393ac710b7ea91bd901d7ca683422108a32a83135ae7e7c864a5a3abed7 |
| apps/server/test/be_02/session_security_test.rb | 79 | a7ec223be079cf705de8d66abd41a4ea6478f3423f856a559d3b8c9de3e1fc65 |
| apps/server/test/be_02/session_store_test.rb | 63 | 4e0c0e3d7279369d1767ea770ebf6ba3ef0d8447c57058613eefb223cd97ca75 |
