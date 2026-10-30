# BE-02 database test review

Static adversarial review for task `task_2c5ffb5784e1`, dispatch `ctx_c7c453ded974`.
**Result: two confirmed test-harness defects; additional contract coverage gaps require follow-up.**
No application implementation defect or passing runtime result is established by this review.
No critical finding was established. The coordinator owns corrections and Docker verification.

## Scope and evidence

| Assigned source | Exact reviewed range | Unique source LOC | SHA-256 of file bytes |
| --- | --- | ---: | --- |
| `apps/server/test/be_02/session_database_test.rb` | 1-197, entire file | 197 | `d3447fe8fe26f42047937fade63bbbcbd44d3c9c8de2440cb3589089e34ef407` |
| `apps/server/test/be_02/database_test_helper.rb` | 1-99, entire file | 99 | `810d6a615c91bff9c3cefd2d71338d030dc548a45cee4fc29ea687ede215d369` |

Each slice is below 200 lines; total unique reviewed source is **296 lines**.
The hashes match the interface report and were rechecked before writing this report.
Context read: `.planning/STANDARDS.md`, `docs/completion/be02-session-database-interface.md`,
and the supplied full review rubric. No other implementation files were read.

<!-- AIDEV-NOTE: Density counts unique assigned physical source lines, including comments and blanks. -->

Confirmed defect density: **2 / 296 x 1,000 = 6.76 defects/KLOC**.
Coverage gaps and unverified runtime questions below are excluded from that numerator.
Fourteen test methods are present. **Zero tests executed by this reviewer.**
No Docker, SSH, host tests, application edits, commits, paid runners or subagents were used.
Only this report was created; shared state and review ledgers were not modified.

## Confirmed test-harness defects

### D1 — P2: worker tests can advance an unrelated revocation intent

Evidence: `session_database_test.rb:166-177` claims the global queue and selects
`.first` at lines 170 and 175. It neither looks up the fixture's intent ID nor
checks that the selected intent belongs to `@digest`. Lines 171, 173 and 177 then
acknowledge failure, overwrite retry state and terminally fail that selected row.
Similarly, lines 99-103 identify an intent using the constant `late-access`, which
is not unique across runs. Claiming the batch already changes other returned
intents, even if a later lookup selects the intended row.

Concrete trigger: the disposable database contains an eligible intent left by
another fixture or interrupted test. If that intent is first, the retry test can
pass by exhausting the unrelated intent while its own intent remains merely
claimed. Teardown (`database_test_helper.rb:35-36`) deletes only intents linked
to this test user, leaving the unrelated queue mutations behind. With more than
20 earlier intents, the late-refresh acknowledgement test may instead fail to
find its own intent. These are conditional, source-demonstrable ownership and
assertion defects, not claims that a clean exclusive database already contains
such rows.

Repair: enforce an exclusive, empty disposable queue before any worker claim,
and assert the exact fixture intent ID and cookie binding after each claim.
Use a fixture-specific marker if a ciphertext lookup is retained. Filtering the
returned array alone cannot prevent the claim operation from mutating foreign
rows. Add a regression proving a foreign queued sentinel is rejected before
claims or that the test receives its own isolated database. Keep cleanup scoped
to owned resources.

### D2 — P3: connection failure paths escape explicit cleanup

Evidence: `database_test_helper.rb:49-55` opens a connection and can then raise
on the login assertion or timeout configuration without closing it. The caller's
instance-variable assignment has not completed, so teardown at lines 45-46
cannot close that connection. In `session_database_test.rb:65`, if creating the
second connection raises, the first connection is also absent from the
`connections` assignment used by the ensure block. Lines 75-76 have a related
failure path: a thread exception re-raised by `join` skips the subsequent close
loop.

Impact: the negative setup and concurrency failure paths can leave connections
and transactions alive until garbage collection or process termination, muddying
later lock failures in the same test process. Statement/lock timeouts do not
replace deterministic connection ownership.

Repair: close the locally opened connection if initialization fails; initialize
the extra-connection collection before filling it; put connection closing in an
ensure that runs even when thread joining fails. Preserve the original failure.
Regression checks should exercise a wrong expected login, second-connection
failure and an exception in a refresh thread, and verify all opened handles close.

## Contract coverage gaps, distinct from confirmed implementation bugs

### G1 — P2: the significant commit-before-logout overlap is absent

Evidence: `session_database_test.rb:181-193` provides two cases:

| Existing case | What it actually establishes |
| --- | --- |
| `commit_before_logout == true` | Login commits at line 188 before logout is invoked at line 189; no login/logout transaction overlap in this arm. |
| `commit_before_logout == false` | The login transaction remains uncommitted while logout captures and commits, then login commits; this is a genuine overlapping transaction case. |

The interface defines the cutoff as the first sorted session query, not logout's
commit. Missing is a login that commits **after that query but before logout
commits**. Such a session must remain outside the captured set, even though its
commit precedes the logout commit. Testing only before invocation versus after
return does not establish this contract.

Bounded addition: explicitly begin the logout transaction on `other`, invoke the
logout function while the new login remains uncommitted, then commit login before
committing logout. Assert both the initiating session's revocation and the new
session's survival. Also retain the opposite commit order and the pre-cutoff
case. This tests the specified SQL boundary without pretending to model an atomic
Auth-HTTP/database transaction.

The coordinator supplied this interface clarification through orchestration:
`create_session` holds its own inserted row and selected authorization-generation
row; it has no actor-wide fence. Global logout locks the committed session set
at its initial query and does not lock that generation. This supports the
existing commit-after case; it does not establish that either case has run.

At lines 63-73, the refresh test uses separate connections, real threads and a
start gate. That is useful concurrent stimulus, but a scheduler may still run
the two calls serially. A transaction held open after the first claim plus an
observably waiting second claim would deterministically test lock contention.

### G2 — P2: real logins are established, but the full role/RLS contract is not

Positive evidence: `database_test_helper.rb:17-19,49-54` opens separate PG
connections and checks `session_user`; no fake connection or `SET ROLE` shortcut
substitutes for API/worker login. `session_database_test.rb:7-20` asserts real
privilege errors for four tables, owner impersonation, one private helper and
one function in each forbidden API/worker direction. It verifies the owner's
NOLOGIN/NOSUPERUSER/NOBYPASSRLS attributes and permitted Auth-session columns.

Missing assertions are material to the written least-privilege requirement:

- The other private tables named in the interface (`authorization_generations`
  and `rate_limits`) and membership INSERT/UPDATE/DELETE denial are not checked.
- The 16 API-only/two worker-only function boundary is sampled, not enumerated;
  accidental grants on an unsampled lifecycle or entry function could pass.
- The RLS assertions at lines 30-33 use one user and organization. They verify
  that the internal verified-user GUC alone reveals nothing and that the intended
  application context can see one membership. They do not establish isolation
  between two tenants, nor negative behavior for crossed user/organization pairs.

Add a second independently owned tenant fixture and focused negative role/DML
checks, including exact allowed function privileges. Do not label the existing
tests mocked; label their coverage partial. No missing grant or bypass is claimed
to exist in the unread implementation.

### G3 — P2: important state-machine and boundary assertions remain missing

| Contract area | Existing evidence | Missing regression evidence |
| --- | --- | --- |
| Binding and lifetimes | Lines 23-29, 50-60: wrong user, forced idle expiry, forced Auth `not_after` expiry | Wrong Auth session for a valid user; Auth-created-at +12h cap using an older session; missing/deleted Auth session; normal touch extension bounded by the absolute deadline |
| No-membership and refresh | Lines 36-47, 79-87, 90-103: no-org creation, later bootstrap, expired claim, late publish after logout | Wrong claim/generation/identity publication; direct `fail_refresh`; assert context/CSRF/cookie stability together and credential disclosure limits |
| Snapshot and generation | Lines 106-126: read-only snapshot survives local revoke; membership removal/readdition invalidates old generation | Membership change across snapshots; capability and mailbox mutation generation bumps; capability NOT NULL constraints |
| Organizations and switching | Lines 157-163: sequential same-org context rotation rejects old hints | Actual switch to another allowed org; forbidden target/current membership denial; list success, empty result and pagination at limit; competing switches |
| Entry workflow | Lines 129-142: recovery claim, contention, known password retry, one-shot completion, uncertainty | Invite kind, verifying/password deadlines, wrong claims/identity, complete-without-membership, collision rollback, and no extra session after denied replay |
| Request limits/validation | Lines 145-154: email sixth call denied; one null digest and upper list/worker limits rejected | 31st IP attempt using distinct emails; atomic counting across both buckets; malformed/duplicate digests, ciphertext byte bounds, zero/null limits, invalid scopes; positive integer `retry_after` |
| Worker state/results | Lines 166-178: backoff and eighth attempt, subject to D1 | Expired 30-second claim reclamation, obsolete acknowledgement after a new claim, and successful/failed acknowledgement `status` as well as `state` |

This is a coverage inventory, not seven additional confirmed bugs. Prioritize
G1/G2 and boundary cases needed to validate the security contract before expanding
lower-risk permutations. Existing happy paths and failure paths are substantial,
but the interface's broad coverage statement must not substitute for these checks.

## Runtime questions and completion checklist

- [x] Reviewed all 296 assigned lines under the full supplied rubric and standards;
  ignored formatting and avoided unrelated architecture work.
- [x] Verified test SQL arguments use `exec_params`; the dynamic function name is
  restricted to a fixed allowlist (`database_test_helper.rb:58-62`).
- [x] Inspected ownership: fixture identifiers/digests are random; normal deletion
  is scoped to them, and membership mutations acquire documented guards. D1/D2
  qualify queue mutation and failure cleanup claims.
- [x] Distinguished actual transaction overlap and real PG roles from missing
  contention/isolation evidence. No product behavior was inferred from unread SQL.
- [x] Checked documentation within scope: the interface explicitly says tests are
  NOT RUN and identifies real Auth compatibility and rollback/reapply as pending.
- [ ] **Runtime question:** do minimal `auth.users(id,email)` and
  `auth.sessions(id,user_id,created_at)` inserts satisfy the pinned Auth schema?
  The coordinator confirmed this remains unproven; Docker execution is required.
- [ ] **Runtime question:** do all test calls and readonly snapshots work under
  real migrated roles? Execute in the coordinator's disposable Docker environment;
  retain actual results, and separately prove migration rollback/reapply.
- [ ] Coordinator to repair/triage D1-D2 and coverage gaps, then add this report's
  coverage/defect accounting to the shared `code-reviews.md` and current state.

No claim is made about frontend, real Auth HTTP, application encryption, native
clients, or unreviewed implementation files. No deep architectural tradeoff was
introduced or simulated; recommendations are limited to this harness and its
written database contract.
