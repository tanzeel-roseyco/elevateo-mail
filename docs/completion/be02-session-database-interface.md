# BE-02A private session database interface

Status: first implementation patch ready for integration; Docker tests NOT RUN. All public functions live in
`app_auth`, return `jsonb`, use named arguments below in positional order, and
are called with bound SQL parameters. This is an internal Rails interface, not a
browser contract. Cookie digests are lowercase SHA-256 hex (64 characters);
token ciphertexts are opaque application-encrypted text (1..16384 bytes).

<!-- AIDEV-NOTE: SQL checks stored bindings; only Rails can attest the preceding trusted Auth HTTP response. -->

Every result contains `status`: `ok`, `unauthorized` (401), `not_found` (404,
including no current membership), `context_changed` (409), or
`temporarily_unavailable` (503, refresh contention; Retry-After 1).
`refresh_uncertain` is terminal, requires reauthentication, and maps to 401.
Function validation raises SQLSTATE 22023; PostgreSQL type parsing retains native
22P02/22003 errors; insufficient privileges remain 42501;
duplicate random cookie/entry digests raise 23505 and must not replace existing rows.
No SQL exception or ciphertext is exposed to the browser. Identity arguments
MUST come from validated Auth responses, never request headers/body identity.

| Function and exact arguments | Successful result / use |
| --- | --- |
| `create_session(p_digest text, p_user uuid, p_auth_session uuid, p_access text, p_refresh text, p_access_expires timestamptz, p_context uuid, p_csrf text)` | Bootstrap deterministic first current org; returns `user_id, auth_session_id, organization_id, organization_name, context_id, csrf_token, authorization_generation, refresh_generation, absolute_expires_at, idle_expires_at, session_created:true`. No membership persists org-null row and returns metadata with `status:not_found`; issue cookie before generic404. Auth policy must already hold. |
| `resolve_session(p_digest text)` | Before Auth HTTP; same fields plus `access_token_ciphertext, access_expires_at`; no refresh credential. Checks local/policy lifetimes. |
| `authorize_session(p_digest text, p_user uuid, p_auth_session uuid, p_context uuid, p_generation bigint)` | Same metadata, after verified Auth HTTP, inside protected snapshot; nullable context/generation means bootstrap without stale-hint check. Rechecks binding, policy and membership before hints. Read-only safe. |
| `touch_session(p_digest text, p_user uuid, p_auth_session uuid)` | `status` only; separate short transaction following successful authorization; cannot revive expiry. |
| `list_organizations(p_digest text, p_user uuid, p_auth_session uuid, p_after uuid, p_limit integer)` | `organizations` array of `{id,name}`, UUID ascending; nullable `p_after`, limit 1..50; `next_after` is last returned ID when more exist. |
| `switch_organization(p_digest text, p_user uuid, p_auth_session uuid, p_organization uuid, p_context uuid, p_csrf text, p_expected_context uuid, p_expected_generation bigint)` | Required expected values come from preceding authorization; session and sorted current/target generation guards fence them atomically. Revalidates current/target membership before rotation; stale winner/loser returns 409. New context/CSRF must differ from stored values. |
| `claim_refresh(p_digest text, p_claim uuid)` | `claim_id, refresh_generation, refresh_token_ciphertext, user_id, auth_session_id`; commit before ONE Auth refresh HTTP call. Claims expire after 10 seconds into terminal uncertainty, never stealing/replay. |
| `publish_refresh(p_digest text, p_claim uuid, p_generation bigint, p_user uuid, p_auth_session uuid, p_access text, p_refresh text, p_access_expires timestamptz)` | Metadata on exact live claim/binding. Does not rotate cookie/context/CSRF; only a previously null org may bootstrap first membership. Still no org returns metadata with `status:not_found`. Late success returns `unauthorized` and durably records usable ciphertext for revocation. |
| `fail_refresh(p_digest text, p_claim uuid, p_generation bigint)` | Marks exact claim terminal uncertain/revoked with durable intent; returns `refresh_uncertain`, otherwise `unauthorized`. |
| `revoke_session(p_digest text, p_scope text)` | Scope exactly `local` or `global`; durably revokes one/all local rows of bound user and records intent. Returns `status:ok, upstream_revocation_pending:true`; never asserts Auth completion. Missing local cookie gives `ok`/pending false; missing/expired global denies. Local ignores Auth/local expiry, global requires live bound policy. |
| `claim_revocations(p_claim uuid, p_limit integer)` | Worker-only; limit 1..20; `intents` array of `{id, claim_id, scope, access_token_ciphertext, attempts}`. Claims expire after 30 seconds for retry, with bounded backoff. |
| `finish_revocation(p_id bigint, p_claim uuid, p_succeeded boolean)` | Worker-only; exact claim acknowledgement; returns `ok` or `not_found`; eighth failed attempt is visible terminal failure. |

API role has only the ten lifecycle functions above and the six entry functions
below; worker has only `claim_revocations` and `finish_revocation`. No runtime
role has private/Auth table SELECT or membership DML.
`elevateo_session_owner` is NOLOGIN/NOSUPERUSER/NOBYPASSRLS and reads only
`auth.sessions(id,user_id,created_at,not_after)`. Its membership RLS predicate
uses transaction-local `app_auth.verified_user_id`, set internally only after
cookie/verified-identity binding. It does not change API tenant RLS policies.

App absolute lifetime is capped at Auth creation +12h and `not_after`; idle is
30m. SQL policy reads use the current transaction snapshot; auth HTTP remains
outside SQL transactions. Access JWT expiration is validated by Rails; refresh
claim may use a locally valid session with expired access JWT. Ciphertexts must
be authenticated encryption using the dedicated server key, never plaintext.

Global logout captures the committed local session set at its first sorted
session-guard query and revokes exactly that set in its transaction. A separately
authenticated login publishing after this cutoff may create a new session;
every later protected use still requires fresh Auth validation. Pending upstream
global revocation may invalidate that new Auth session. This boundary is not an
atomic transaction spanning Auth HTTP and PostgreSQL; overlapping-login tests
cover commits on both sides of the cutoff.

Mailbox membership columns `compose`, `approve_send`, `manage_members` are
boolean NOT NULL DEFAULT false. Mailboxes additionally have `display_name` text
NOT NULL DEFAULT '' and nullable `display_address` text, each capped at 256
characters; existing transport `address` is preserved. Generation tombstones live in private
`authorization_generations(user_id, organization_id, generation)` and survive
membership removal/readdition. Membership/capability/mailbox changes bump them.
For future writes, `lock_authorization_generations(p_organization uuid,
p_user uuid)` (returns void; NULL user means all existing org generations) is
owner-only: lock session first, generations sorted by org/user, then business
rows. Controlled fixture/admin mutations must take these guards before DML;
triggers perform same-transaction bumps but cannot retroactively fix lock order.

Rollback removes only BE-02 private objects, capability/display columns and generation
triggers/policy/grants. Bootstrap role prerequisites remain reusable.

Additional A entry functions (API-only, `jsonb`; digest/ciphertext rules above):

| Function | Result |
| --- | --- |
| `stage_entry(p_digest text, p_kind text, p_token text)` | Kind invite/recovery; stores encrypted hash, returns `status:ok, expires_at` (10m). |
| `claim_entry(p_digest text, p_claim uuid)` | Returns `step:verify, kind, token_ciphertext` or `step:password, user_id, auth_session_id, access_token_ciphertext, refresh_token_ciphertext, access_expires_at`. Commit before HTTP; contention 503; timed-out verify terminal unauthorized. |
| `verify_entry(p_digest text, p_claim uuid, p_user uuid, p_auth_session uuid, p_access text, p_refresh text, p_access_expires timestamptz)` | CAS the live verifying claim to password_pending after verified Auth response; retains same claim/deadline. Returns `ok` or `unauthorized`. |
| `fail_entry(p_digest text, p_claim uuid, p_retry_password boolean)` | Known password-step failure may release claim for retry when true; all other failures become uncertain. Returns `ok` or `unauthorized`. |
| `complete_entry(p_digest text, p_claim uuid, p_cookie_digest text, p_context uuid, p_csrf text)` | Atomically consumes live password claim and creates the cookie session from stored verified credentials. Returns creation metadata, including no-org `not_found/session_created:true`; no repeated completion. |
| `consume_entry_limits(p_email_digest text, p_ip_digest text)` | Both counters increment atomically; 5/email and 30/IP per fixed 15m window, returns `ok` or `rate_limited` with integer `retry_after`. Call before login/recovery HTTP. Raw identity/IP never stored. |

Integration prerequisites: execute `ops/db/bootstrap.sql` on the empty database,
start pinned Auth and await migrations, then execute
`ops/db/bootstrap-auth-grants.sql` before Rails migrations. The second phase
fails closed on missing/wrong Auth columns, overly broad privileges or enabled
Auth-session RLS requiring a separately assessed policy; it never bypasses RLS.
Worker reconciliation also deletes at most 100 expired rate buckets per poll.

Run the database tests only inside the pinned Rails/Postgres Docker environment:
`bundle exec ruby test/be_02/session_database_test.rb`. The isolated harness
requires `BE02_ADMIN_DATABASE_URL` (supabase_admin fixture connection),
`BE02_API_DATABASE_URL` (actual elevateo_api login), and
`BE02_WORKER_DATABASE_URL` (actual elevateo_worker login), on a disposable test
database with both migrations applied. It creates random fixtures and deletes
only its own rows. Do not run alongside a real revocation worker: claim tests
intentionally exercise the shared queue. Credentials must stay in ignored test
environment inputs; the harness never prints their values.

Tests are NOT RUN by this worker. Static implementation covers privilege denial,
identity binding, no-org bootstrap, idle/Auth expiry, concurrent refresh claims,
late publication after logout, durable intent acknowledgement, read snapshots,
generation tombstones, switch compare-and-set, revocation retry limits,
overlapping login/logout, pending-entry replay and request limits. Coordinator owns
container execution, adversarial review, rollback/reapply proof and native evidence.

Implementation snapshot: 14 database integration tests authored, zero executed.
All 17 implementation/test/bootstrap files below are at most 197 lines each;
bootstrap.sql changes are +26/-2 against the current index. All other listed
code files are new. No commits, Docker resources, remote writes or host tests
were created by this worker. Remaining integration risks include pinned Auth
catalog/RLS compatibility, real-role execution, migration rollback/reapply and
the minimal real-Auth fixture columns. Rails must still prove encryption, bound
parameter calls and HTTP outside transactions. Hashes are SHA-256 file bytes.

| Snapshot path | Lines | SHA-256 |
| --- | ---: | --- |
| apps/server/db/migrate/20261013000001_create_private_sessions.rb | 37 | 14c480c927b70749e4f002fcdb1f133c29e0cd3832d6934d1b83f7ef25bdf3bd |
| ops/db/bootstrap.sql | 114 | 8cffde366e1f82a9885f0550f26530cf62e7bea951680cb5cbd915927940f82f |
| ops/db/bootstrap-auth-grants.sql | 32 | b4bd67444253ba00f09c804db6eda969074c71e21b36bd3d6a0d9e2c1e8714f8 |
| apps/server/test/be_02/database_test_helper.rb | 99 | 810d6a615c91bff9c3cefd2d71338d030dc548a45cee4fc29ea687ede215d369 |
| apps/server/test/be_02/session_database_test.rb | 197 | d3447fe8fe26f42047937fade63bbbcbd44d3c9c8de2440cb3589089e34ef407 |
| apps/server/db/be02/down.sql | 43 | dbe583b6ef62ad194d9f5143e04ba148aec9b1a323ef688d35c0673b628e18ce |
| apps/server/db/be02/entry.sql | 71 | ce3d90535aa4aaa1fbb0edcc59ba0dedd4d2b8f58d20d053a0bb1beb729be671 |
| apps/server/db/be02/generations.sql | 40 | 10ea0d49eeed5f53a0ae24ef419860b486c5c5a0691963897cc3c27193866ba1 |
| apps/server/db/be02/grants.sql | 27 | f910a3c1c9ed8e7b6f27517137fa11f09dbeb1cb2ba7ec3be86b58926227f4f6 |
| apps/server/db/be02/helpers.sql | 78 | bdf1c432c86bedf8c9a67a8c25bdca0a52dce9e0bf983fa103171905d391af92 |
| apps/server/db/be02/pending.sql | 109 | 733c5c6188b83fcf95fcd732584cf08adb32c3c0156e77dca2d774443e93e4d1 |
| apps/server/db/be02/rate_limits.sql | 28 | 0aa2462ec1ff030d87f5cb7700b26a4888a6c1fccf3f31a58ad10cfdf9e0817b |
| apps/server/db/be02/read.sql | 65 | 6eb45c848aeb364b984a9cab260c3ccdc18471f61a1e70de1d19c7234ec79f1b |
| apps/server/db/be02/refresh.sql | 91 | a71de77e9ddd677ab3495532bd16eaf764e6b7798e87ca2156f34bd0123aaebd |
| apps/server/db/be02/revocation.sql | 87 | 6f35e1a45c9967372679b19feefc9e60a8f1a21b67424944ade4f2d08154015f |
| apps/server/db/be02/tables.sql | 76 | 9e6c0ce57fb67d285228e221a49463df86e0e5bbc6378cffe92c426f8b40dc19 |
| apps/server/db/be02/triggers.sql | 7 | af6892033d65e6df13f2072b26826ee4a91c4fd02d472993ab6f4a573efd5073 |
