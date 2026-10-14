# BE-403 R7 / ADV781 worker drain repair

Application IN PROGRESS; repair runtime, Steep and lint NOT_RUN. Root assigns independent functional and dedicated design reviews. No tests/builds/Docker/dependency installs executed by Rowan.

## Evidence inspected first

Exact parent 94d32db7fa6d626be371361ec01d055a5f497dbb, imported from reports/cassian-app-94d32db.bundle with SHA2567a16f75fd0a2bba7f2d4a3fb4d60bdfd03d5813c29afe440fa12613762c6944e. Prerequisites45405cc50a5d76b78ee9584614bd99f7785bc186,8a18f399c6d16d90a177b9e4572f4026e1588f47,2c31b41eed1346a2945a82f209a2e8d10e8aeabe; git bundle verify succeeded before import. Original Rowan b813210173acea67e7333fffa05e146f237193ea history and untracked files preserved; repair in separate rowan-r7 worktree, branch fix/rowan-r7-worker-drain. Latest relevant rowan inbox and source receipt read.

Soren sanitized evidence directory: soren/.local-jobs/app-94d32db-r8/ops/local/be02-3af0d599135d4b81b3d1e1536f0df234.
- 043-worker-drain.log SHA256 e0b8bef0478b8f46dfa6c1c682bb425a9c72dec75d91b96459cb7920ac42ae36: FAIL exit1/31.08seconds.
- 044-service-logs.log SHA256 66e0e63b706326679ba0486480e5397b709c2b0b6b212b6c2b86c25a71215e9c: logout204 at03:00:50/51; logout403/session_not_found at03:00:52/54/58/03:01:06.
- Reported actual frozen R8 fullbackend386runs5734assertionsPASS and authenticatedHTTPPASS retained as parent evidence, not repair verification.

## Source-established defects versus inferred execution

Production revoke_session SQL captured all actor sessions including earlier revoked ones and upgraded every captured row/intent to global. Fixture http_test.rb first queues local logout, then logs in again and queues global logout before worker_check.rb drains. Thus redundant global credentials can be already invalid when attempted. AuthClient#request converted every403 into unauthorized; AuthRevocations durably retried every AuthError. These are product defects, not an incorrect completion oracle.

The exact association of204/403 responses to intent IDs is unavailable in sanitized evidence. Local-first invalidating an old global credential, or global-first removing remaining local sessions, are inferred schedules; no exact runtime root-cause proof claimed.

Pinned provider v2.196.0 source confirms JWT verification/user lookup precede session lookup, missing session emits403/session_not_found, and global logout requires that authentication before deleting all user sessions:
- https://raw.githubusercontent.com/supabase/auth/v2.196.0/internal/api/auth.go
- https://raw.githubusercontent.com/supabase/auth/v2.196.0/internal/api/logout.go
- https://raw.githubusercontent.com/supabase/auth/v2.196.0/internal/api/apierrors/apierrors.go
HTTPError uses numeric code and string error_code. Message text is never matched or logged.

## Minimal repair

Only authenticated caller receives a new global revocation scope; other captured rows retain local scope, including late-refresh disposal through existing revocation_scope coupling. Existing global obligations are preserved rather than downgraded. All captured application sessions still revoke atomically; cut ordering, claims, eight-attempt limits and durable acknowledgement fences unchanged.

Only local logout may accept HTTP403 with JSON numeric code403 and error_code exactly session_not_found. The existing parser rejects duplicates, malformed/nonobject/oversized bodies; normal content type and response budget apply. Global logout missing-session responses remain failure because one missing session does not prove all user sessions are absent. Other errors/paths retain deliberate unauthorized/unavailable behavior. No credentials or provider bodies enter reports/logs.

Regressions cover204/global happy path, local typed absence, fixed scope/path/single call, global and /user rejection, bad JWT, missing/wrong typed fields, wrong status/content type, duplicate/malformed/nonobject/oversized JSON,503, durable worker true/false acknowledgements, old-local/new-global intent set and metadata, denial of revoked-global caller, and existing three committed-cut schedules. Worker30second completion oracle unchanged.

## Verification and limits

Only source inspection, Git diff whitespace check and bundle provenance validation performed here. No runtime acceptance claimed. Fresh isolated migrations consume updated SQL; this repair does not rewrite already applied persistent databases or queued historical intents. No live/persistent rollout is authorized. Distinct concurrent global requests or old global intents with unavailable credentials can still fail deliberately; no broad403 success or completion assertion is substituted.

Soren exclusively schedules targeted auth_client_test, auth_revocations_test, session_logout_cut_test plus session_database_test/revocation_worker_test, strict Steep and lint; then frozen full backend, real authenticatedHTTP and worker drain using unchanged worker_check.rb. Preserve real failure evidence and exact cleanup. Root assigns reviews from immutable packet manifest; only root writes actual Obsidian vault. No BE03, observer, frontend, paid or live-mail scope.

Requested GPT6.1Sol low/Fast YOLO; actual model/billing tier unavailable to this assistant, Fast unproven. No CLI model substitution or extra runner launched.
