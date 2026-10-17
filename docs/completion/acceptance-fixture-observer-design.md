# ACCEPTANCE-FIXTURE-OBSERVER-R1 — task 2 design

Status: **bounded design and three exact-model consultations complete; implementation and application acceptance NOT_READY**. This is an implementation contract, not evidence that its tests have run. Integrated R3 reached the draft migration and failed private-schema CREATE; root reported cleanup 16/16. No real Rails browser journey ran. This worker made no application changes, commits, Docker changes, SSH connections, installations, or application test runs.

<!-- AIDEV-NOTE: Task 2 owns fixture/observer design; root owns topology, implementation dispatch, tests, and evidence sealing. -->

## 1. Authority, consultation, and frozen review

Actual synthesizer: **gpt-6-astra, max**, confirmed by coordinator runtime message `msg_02d029ee96bc`. Three fresh native-account Claude CLI processes used version **2.1.296**, successful help/version preflight, safe mode, print JSON, empty tool list, no session persistence, argument arrays, file stdin, and a 900-second deadline each. They ran concurrently, received the same frozen governing/source packet plus their separate prescribed focus, and never received one another's outputs.

| Exact requested and returned identity | Session | Exit / result | Duration |
|---|---|---|---|
| `claude-fable-5` | `07dd2025-11cc-4712-91f5-78d91fd02355` | 0 / success, non-error | 131.324 s |
| `claude-opus-5-5` | `8f32878e-9530-4032-825b-380c76b4831f` | 0 / success, non-error | 131.203 s |
| `claude-fable-5-1` | `52292992-52e9-46f0-bc1c-8188fb1d2e02` | 0 / success, non-error | 294.821 s |

The common packet was 319,374 bytes, SHA-256 `7b3d7eccca8c29c4365f63205b90138036fcb359775e91f3b2cdcb41e684ca34`. The [consultation manifest](../../.planning/consultations/results/acceptance-fixture-observer-r1/packet-manifest.json) records all document/source/input hashes and identical omissions. README lines 1–3 and 264–315, state lines 1–3 and 49–97, and documentation lines 1–3 and 50–112 were supplied; other historical/introduction portions of those three files were identically omitted. Every other mandatory governing document was supplied in full. The latest checkpoint and task brief explicitly superseded older pending statuses. Full prompts/raw CLI JSON remain ignored and private.

[Metadata](../../.planning/consultations/results/acceptance-fixture-observer-r1/metadata.json), [Fable 5](../../.planning/consultations/results/acceptance-fixture-observer-r1/claude-fable-5.md), [Opus 5.5](../../.planning/consultations/results/acceptance-fixture-observer-r1/claude-opus-5-5.md), [Fable 5.1](../../.planning/consultations/results/acceptance-fixture-observer-r1/claude-fable-5-1.md), and the [complete Astra disposition table](../../.planning/consultations/results/acceptance-fixture-observer-r1/astra-max-synthesis.md) preserve execution evidence and dissent. Opinion suggestions assigning implementation to this worker are superseded by this dispatch's design-only scope.

Coordinator base: `d2de43b438ad9fb5f003d3e808a6181dbd827632`; BE base: `5785eba47f3709debb2815c8d86608f7e62d02f3`. Five source hashes matched before review and again at packet freeze:

| Repository / source | Reviewed lines | SHA-256 |
|---|---:|---|
| BE `ops/tests/be02/acceptance_seed.rb` | 1–181 | `d11cc2e713ad7f3bdc60722198606645139419a22d7a2c88ec574bed59a774a3` |
| BE `apps/server/db/be02_drafts/tables.sql` | 1–45 | `c2c507d3d301703eca1091b7e5243242bbdb76b3ffe6e1f592fad362f4947cf1` |
| BE `apps/server/db/be02_drafts/operations.sql` | 1–50 | `9b2999a43136a27432a12d72d60793e29ac4a7693fc2f7114ab9dfe43b11d4a1` |
| BE `apps/server/db/be02_threads/tables.sql` | 1–50 | `dce2ada3d0cc33aad99a02e5411dd3dc64fb55e6080449f280fe3451cb456a80` |
| Coordinator `tests/acceptance/shared/seed-contract.json` | 1–22 | `221d49259f52f2dcc9944a3af7744327cc2cbc1a3030fa4d13ae85b292e6a952` |

Review used **348 unique implementation/test LOC**, in passes of **181 and 167**. No additional helper was inspected. The remaining 52 lines are not self-authorized scope. Requirements, opinions, and this design do not count as implementation review. Final hash changes must be recorded without silently applying these opinions to repaired code.

The [final document/provenance validation](../../.planning/consultations/results/acceptance-fixture-observer-r1/validation.json) verified all three exact models, non-error exits and distinct sessions; unchanged published opinion text; common input packet hashes; 39 complete dispositions; local document links; and private-file ignore rules. At that check all five source hashes, governing document hashes and both repository heads still matched the frozen packet. These were artifact-integrity checks on the host, not application tests. Future schema repairs still require the explicit delta reconciliation below.

## 2. Decisions and ownership

Use a **fresh disposable Auth/PG dataset for every engine × case × attempt** in this bounded wave, with exactly the same nine actor meanings. Each retry gets a new dataset identity. Root may execute datasets sequentially; this decision does not require concurrent application stacks. It avoids uncertain shared-session/read-state effects as well as actor-global authorization generation poisoning. Do not reseed a used database, restore old generations, reset counters, or run a credential/membership mutation last and rely on order. Sharing read-only/draft-only cases is a later optimization requiring its own inspected isolation proof.

Use one small, private, one-shot PG observer in the BE ops runtime, with fixed queries and a fresh connection per observation. Prefer an already-existing private harness only after its exact source is allocated and reviewed. If none fits, use bounded request/response files on a root-owned private mount; root launches the observer in its existing trusted service context. Do not add a generic server, public endpoint, Docker socket, independent domain backend, or new socket sidecar merely to implement this protocol.

The observer receives a **test-bootstrap-only dedicated principal** with the narrow SELECT column/table grants required below and explicit RLS bypass in an isolated task database. Production migrations, API/worker roles and policies remain unchanged. The role and bootstrap need root's scoped review; until visibility and privilege checks pass, observations are blocked. Reusing the seed's connection/config code is conditional on inspecting it; reusing its administrator credential is not the default.

| Owner | Bounded responsibility |
|---|---|
| Root / T0 | Fixture/report schema integration, private topology, process/channel/role lifecycle, source sandbox, all fleet-02/Docker mutation and application/browser tests, artifact sealing and cleanup. |
| Root-dispatched BE fixture implementer | Seed v2, exact membership/row verification, committed fresh-connection verification, fixed observer query code. |
| Root-dispatched lane implementer | Real browser cases using the accepted transport and proof contracts; no synthesized business responses. |
| Schema worker | Existing restricted-role private-schema CREATE prerequisite and its own review; supply resulting hashes/delta. |
| Existing-case worker | Duplicate login, stale logout response, zero-mailbox and privacy cases, and any assigned scoped revocation. No duplication here. |
| Task 3 | AUTH-003-F1 lock barriers/order and GUI-006-F1 routing. It supplies real session bindings and transaction/lock acknowledgments. |
| This worker | This design, consultation provenance, tradeoff synthesis, and bounded source review only. |

## 3. Exact fixture extension contract

### 3.1 Version and lifetime

Atomically update the seed producer, strict shared loader, schema/example, every affected consumer, and T0 validation to `schema_version: 2`. Reject unsupported versions and unknown keys; do not let a v1 parser silently ignore v2 memberships. Keep the existing base actor fields and primary capability meanings. Any deliberate v1 support must have a separate explicit parser; it is not a compatibility promise made here.

The private runtime manifest has these required additions; no new product API fields are proposed:

| Field | Closed contract |
|---|---|
| `fixture_identity` | Root-issued run, engine, case, attempt and fresh dataset identifiers plus a private random dataset nonce; exact matches required on every observation. Root's existing schemas supply string/size bounds. |
| `fixture_variant` | Exactly `base`, `multi_mailbox`, or `literal_read`. All DRAFT cases and AUTH-006-P use `base`. |
| `extra_mailboxes` | Exactly empty for `base`/`literal_read`; for `multi_mailbox`, exactly `secondary` and `excluded`, both in the primary organization. Allocate their UUIDs once before the seed transaction and publish only after verification. |
| `extra_mailbox_memberships` | Empty except `multi_mailbox`, where the sole extra is `composer → secondary` with capabilities exactly `[read]`. `excluded` has no membership for any of the nine actors. |
| `expected_mailbox_memberships` | All nine actor aliases, each mapped to its **complete** mailbox/capability set, including an explicit empty set. It is independently checked against database rows, not trusted as a self-fulfilling expectation. |
| `fixture_resources` | Closed alias-to-ID map for the base resources and the two `literal_read` threads/messages below. No arbitrary SQL/table/column/payload templates. Additions are synthetic and unique in this dataset. |
| `schema_fingerprint` | Reviewed migration/source identity plus actual required column/constraint contract; mismatches stop publication. |

Existing actor invariants remain explicit:

| Actor | Base meaning that must remain |
|---|---|
| `manager_primary`, `manager_backup` | Primary-org/base-mailbox read, compose, approve_send, manage. |
| `reader` | Primary/base mailbox read only. |
| `composer` | Primary/base mailbox read and compose; in the multi-mailbox variant only, secondary read without compose. |
| `approver` | Primary/base mailbox read, compose, approve_send; no new membership. |
| `disabled` | Disabled Auth identity, no mailbox capability. |
| `revoked` | Existing revoked-mailbox semantics and trigger/generation checks; no added membership. |
| `no_membership` | No organization or mailbox membership. |
| `other_org` | Other organization/base mailbox read only and existing historical-draft meaning. |

Keep exactly **nine Auth identities**, not merely nine rows matching an email suffix. Require a fresh task Auth store with the expected exact identity set. New mailbox rows are not new users. No real email, password, authorization signature, Auth token, cookie, or callback URL enters public evidence; runtime access/signing material remains in the private fixture channel.

### 3.2 Seed ordering and independent verification

1. Fail before mutation if this task dataset is not fresh. Allocate all synthetic resource IDs once. Create the same nine real Auth identities through the existing supported runtime; never manufacture password hashes or sessions.
2. In the seed transaction, create base rows, variant rows, membership changes, the existing revocation exercise and historical-draft capability toggle. No browser case runs yet. Do not add runtime memberships to a published shared actor.
3. Commit that transaction. Open a **new** database connection and consistent read-only verification transaction. Verify exact Auth identities/status, organization memberships, complete mailbox/capability sets, expected null/value rows, version bounds, and all base invariants. Compare sets including duplicate detection; `at least expected` is invalid.
4. Compute real authorization versions only after all generation-changing work has committed and been verified. Preserve the existing generation-trigger checks; never reset a generation to keep a fixture value stable. Inspect the existing signer/publisher before using it.
5. Close successful verification, then atomically publish the private manifest with its hash. Any exception, missing field, mismatch, partial file, unexpected actor, or extra membership prevents publication and causes disposal of the entire task dataset. Auth creation plus application seed is not claimed to be one cross-service atomic transaction.

The current seed commits content before verifying, then publishes, but verifies on its existing connection. The new-connection requirement strengthens evidence for this wave; it is not a claimed existing seed defect. The current hard-coded one-mailbox check must become exact-set equality, not be removed.

### 3.3 Literal-read variant

Preserve the current primary/other threads and manager-backup read-state sample. Add exactly two primary-mailbox threads, each with one message:

| Alias | Data | Read-state baseline |
|---|---|---|
| `read_empty` | Subject NULL; sender NULL; recipients `[]`; sent_at NULL; body empty string; attachment count 0. | No reader row. Absence is distinct from an explicit unread row. |
| `read_literal` | Subject empty string; sender NULL; recipients `[]`; fixed valid sent_at; body is a fixed synthetic literal containing script/image/link-like text and a script-execution marker; attachment count 0. | Reader explicit unread row with the schema-valid version; manager-backup separate read row as a non-target guard. |

The hostile string may name only a reserved non-routable test origin. Export a sample identifier, not the payload or any real message. Assert exact literal text, no injected HTML nodes/active links for that sample, no script marker, and zero external requests. Do not add a sanitizer or force invalid sender structures through an uninspected validator. Bidi/zero-width and ordering probes are optional later cases, not requirements for this smallest extension.

The base DDL reviewed here has no `read_state_version`, while the seed writes it. That proves an **uninspected schema dependency**, not a broken final migration chain. The implementation owner must obtain the later migration/final column contract before creating these rows or defining the observer comparison. Include every real read-state version/timestamp column in the invariant.

## 4. Private observer contract

### 4.1 Privilege, connection, and scope

The observer is independent of Rails API authorization and reads the actual task PG database. Its ability to see a private operation row does **not** prove the browser actor may read that row; the real API/UI assertions remain mandatory.

Root creates the dedicated local role only through the disposable task bootstrap: non-superuser, no role/database creation, no replication, no application role membership or SET ROLE path, no write grants, explicit SELECT on required columns, USAGE only on required schemas, and explicit RLS bypass. FORCE RLS makes ordinary SELECT grants insufficient for reliable absence proofs. Do not install a test policy or security-definer helper into production migrations. Column grants for Auth/session state wait for task 3's exact reviewed schema; no password/token/hash column is exported. Audit effective privileges, not merely role names, and fail closed if the configured database is not the task dataset.

PostgreSQL roles are cluster-scoped, so creating a role while connected to one database does not confine it to that database. Root must use the isolated task cluster, verify effective database access/grants and role memberships, and account for role cleanup separately if retaining that cluster. Dropping a fixture database alone does not remove the role. [PostgreSQL CREATE ROLE](https://www.postgresql.org/docs/current/sql-createrole.html)

Use the existing Ruby/PG dependency if its reviewed runtime can open a separate connection. Do not add Node `pg` or pass PG credentials to Playwright/browser storage, page scripts, screenshots, environment exposed to the frontend, or the evidence report. The trusted process reads an existing private configuration file/mount; no credential command-line argument or DSN logging.

Every call validates the dataset identity, allowed case/phase/query, exact synthetic IDs, expected actor/mailbox/draft bindings, and an immutable private expected-value reference. No caller SQL, paths, table names, GUC authorization impersonation, or unrestricted ID list. A real client-generated operation ID is registered once from the exact captured request into its declared case operation slot before forwarding; it is not fabricated in the page. Unexpected operation IDs, drafts or attempts fail rather than widen scope.

Each call opens a **new PG connection**, begins one `REPEATABLE READ READ ONLY` transaction after its named completed phase, runs the fixed related queries in that single snapshot, closes the transaction/connection, and atomically emits its proof. No pool snapshot reuse, row locks, advisory locks, mutations, or polling until a desired value appears. Baseline and final observations necessarily use different connections/snapshots.

PostgreSQL's repeatable-read snapshot is established by the first data statement, and stays consistent for the transaction; default read committed would allow successive queries to see different committed states. Thus the first query must follow the phase acknowledgment, and draft/ledger facts must share one snapshot. This is a design principle, not proof of the installed PG version. [PostgreSQL transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html)

Startup requires positive visibility of the seeded drafts and declared fixture rows, actual expected role properties, schema/column checks, and a **known operation sentinel** visibility check in a separate disposable observer self-test dataset. Do not seed a fake operation receipt into a browser acceptance case to perform this check. Root's Docker tests must prove the observer sees an actual applied receipt and cannot write. Failure to see a known visible row is `observer_visibility_error`, never `absent`.

### 4.2 Small private control channel

Fallback transport is a pair of atomic files per observation in a root-owned attempt directory. Only the trusted runner/controller and observer mount it; Rails routes, frontend serving paths and browser contexts cannot access it. Root prepares the observer execution context before browser requests; a request file never asks the browser or a container to invoke Docker.

The controller writes a bounded request to a temporary file then renames it. The observer reads exactly that expected basename once, validates it, writes one bounded result via atomic rename, and exits. Reject symlinks/path traversal, unknown fields, partial frames, duplicate sequence numbers, reused nonces, mismatched proof hashes and stale attempts. The controller uses filesystem readiness/process completion with a finite deadline; arbitrary sleeps are not evidence of transaction completion. No daemon loop or generic fault-command vocabulary is required.

Request fields are `version=1`, root fixture identity, increasing case sequence, `phase_ack_ref`, closed `query_id`, allowed resource aliases/resolved IDs, one-time operation/session binding references where needed, and `expectation_ref`. A response contains matching identity/sequence/request digest, `proof_id`, redacted-proof SHA-256, `observed_phase_ref`, closed `outcome=observed|observer_error`, and typed facts. The producer emits the redacted proof **before** returning an acknowledgment. The controller reads and validates it live before releasing a transport gate. Timestamps aid diagnostics; causal references and sequence order establish ordering.

Use root's existing strict size/time/resource budgets. Suggested small local frame caps or a two-second query timeout from the opinions are **not newly accepted budgets**. Root must freeze actual protocol, DB statement/connect, held-response and case deadlines before implementation, without increasing client timeouts or the session-race one-second lock budget. Timeout/error/EOF/schema mismatch returns a bounded error code and no absence facts.

### 4.3 Fixed query catalogue and redacted facts

| Query | Exact scope | Facts exported |
|---|---|---|
| `membership_set` | One of nine actors, expected organization and this dataset's declared mailbox set. | Expected-set equality, actual synthetic mailbox aliases/capability sets, positive generation/equality result. No signed version. |
| `draft_operation` | One case-owned draft, exact org/mailbox/actor, and the case's registered operation slots, all in one snapshot. | Draft exists/version/state; subject/body/recipient/reply binding equality booleans; ledger existence/outcome/detail-present/expiry and binding checks; bounded operation count for this exact case draft/actor. |
| `read_state_set` | The two declared threads × nine fixture actors, at most 18 key tuples. | Row presence and is_read/version/timestamp equality against private baseline, non-target equality and unexpected-row check within those threads. No message content. |
| `session_state` | One fixture actor and opaque session aliases supplied by task 3's private binding. | Exact-session presence/revocation/activity, supported recovery/acceptance facts from the reviewed schema, and separate scoped Auth/app counts. No token/hash/PID/cookie value. |

Avoid independent `draft_state` and `operation_state` calls for one commit proof; their snapshots could disagree. Do not compare the application's `payload_digest` to a harness-invented hash: the application canonicalization/write path is uninspected. Compare actual stored fields with the privately frozen typed submission, including recipient order and reply reference under the inspected API normalization rules. A proof digest authenticates the evidence bytes; it is not the application's operation digest.

A positive committed result requires a fresh-snapshot visible operation with the expected applied/conflict detail and the matching persisted draft facts. An empty result is only absence **at that snapshot**. It does not prove rollback or future non-commit. Root keeps raw comparison material private and exports only the bounded redacted facts and content-addressed proof references.

## 5. Real browser and transport proof sequences

All case samples below remain **NOT_RUN**. Use the same private `app.test` Rails/Auth/PG stack and authentic browser session. Every request still passes normal CSRF, Origin, session-context, authorization-generation and resource authorization checks. Preserve public endpoint/status/body/byte budgets; inspect their exact source before implementing assertions. SQL subject/body limits establish database constraints, not an HTTP response contract.

### 5.1 AUTH-006-P

Use `reader` in a dedicated base dataset. Record a private Mailpit baseline, trigger the actual supported recovery/one-time flow, and identify the one new message for that existing synthetic recipient. Use the real documented server-staged entry and query-free `/auth/complete`, then explicit acceptance UI/POST. Confirm Auth verification occurs before Rails session creation, passive completion navigation does not create an accepted app session, and a protected read succeeds after explicit acceptance. Observe the exact resulting sessions, not an assumed physical count transition from zero to one.

Mailpit access/link parsing remains in the trusted private harness. The accepted topology explicitly says **no Auth token in the browser**; blindly navigating a token-bearing Mailpit URL is rejected. If the existing flow cannot meet that staging contract, report a product/topology gap; do not manufacture a cookie/token or introduce a tenth actor. Missing Mailpit delivery within the root deadline is blocked evidence, not proof of invalid credentials. Expired/consumed entry must fail safely with no new accepted session, and replay of the same entry must not create another. Close the browser and discard the entire case dataset after collecting redacted proof; never restore the actor password for reuse.

### 5.2 READ-001-P and READ-002-F2

For READ-001-P, log in as composer in `multi_mailbox`. Assert exactly the base primary mailbox `{read, compose}` and secondary `{read}`, with no capability union and no excluded/other-org mailbox. Compare real API listing and actual UI scope selection to the verified seed/observer set. Do not change memberships during the case or republish a version mid-case.

For READ-002-F2, capture a fresh `read_state_set` baseline, issue the real detail GET, await its settled request phase, and capture a new complete snapshot. Freeze the actual route's transaction/completion contract first: a returned status alone cannot exclude deferred read-state work. Require its real completion acknowledgment or inspected synchronous completion guarantee and no owned pending write tasks before the final snapshot. Row absence must stay absent; explicit unread/read values, versions and timestamps must stay equal, including non-target actor rows. Validate null/empty visual states and literal rendering in the actual application. If opening the UI issues a separate mark-read write, record it separately: that combined journey cannot prove a GET invariant. Root must isolate a genuine authenticated browser GET without that extra write, then perform the visual journey as a distinct sample. Never suppress a real write with a fake successful response or blame a GET for a concurrent write.

### 5.3 DRAFT-001-F1/F2

F1 uses two genuine contexts of the same composer and base draft D at n. B saves its distinct payload and a completed observer proof shows n+1 and B's persisted fields. A then submits its old n with its own real operation identity. Assert the real documented conflict, A's retained local text, and D still at n+1/B. Record A's actual ledger behavior; the recorded-conflict requirement is separately strict in DRAFT-003-F2. Do not rewrite response bodies or expected versions in flight.

F2 uses separate attempts for subject/body over-limit and invalid reply binding. The reviewed SQL limits are 998 subject characters and 65,536 body characters; use at-limit controls and one-past values, within the unchanged external byte budget. Freeze HTTP validation, Unicode counting/normalization, exact error code/status, and reply contract first. An authentic bounded validation rejection plus a settled-path DB comparison must prove no version/content/reply overwrite. A 500 is a boundary failure even if the CHECK prevented mutation. If UI validation prevents dispatch, report that UI result separately and issue the rejected request through the actual authenticated browser API path; it is not yet proof of backend validation. Do not inflate response/request limits just to fit an astral-character sample.

### 5.4 DRAFT-003-P: committed save, response lost

1. Register D, author A, starting version n, client-generated operation O, frozen submitted fields F and distinct newer local buffer L. Baseline proves O absent and D at n. The gate matches the exact case draft/method/session and fails on unexpected writes/operations.
2. Forward the authentic request exactly once and hold its **real** response. Preferred browser interception is `route.fetch` without modifying the request or fulfilling a fabricated business response. Explicitly disable forwarding retries/redirects and use the root deadline. Record its relay provenance rather than call it an untouched browser transport.
3. Request one fresh `draft_operation` observation after the forwarding phase. Require O's applied receipt, exact actor/mailbox/draft binding, D at n+1 and persisted F. The private controller must receive, validate and acknowledge this concrete proof **while browser delivery is still held**.
4. Only after that acknowledgment, abort browser delivery. Required causal order: `forward_complete → committed_snapshot → proof_received → delivery_aborted → real_lookup(O)`. HTTP status alone, a sleep, a future sidecar log, or proof collected only after the abort cannot satisfy this case.
5. Assert uncertainty, then authentic same-O lookup/reconciliation. F is saved and L remains unsaved; if the product retries the same O, it must not create n+2 or a second operation. Do not add a retry behavior the product does not have merely for coverage.

Playwright documents `route.fetch` as performing the upstream request without fulfilling the intercepted browser response. Root must verify that the pinned version supports the selected options and preserves real cookie/Origin/CSRF/session-context behavior. Also prove that response-side cookie updates do not reach a shared cookie jar before the simulated loss; if they do, this mechanism is not equivalent for that route. Use an inspected private proxy gate only as a separately reviewed fallback. [Playwright Route API](https://playwright.dev/docs/api/class-route)

If the client times out before the acknowledgment, the loss happened in the wrong order: fail the control/record unknown and do not call it after-COMMIT injection. If the observer times out, sees a conflict, cannot validate scope, or cannot read the schema, abort only for cleanup and report blocked/failed evidence with commit status unresolved or the actual contrary fact. Never reinterpret missing evidence as rollback.

### 5.5 DRAFT-003-F1: permanently not forwarded

Install a gate that prevents **every** mutating request to this case draft from forwarding for the remainder of the sample, including automatic retries/new operation IDs. Its reviewed coverage must include every owned page/context and any service-worker or other transport bypass; incomplete coverage blocks the proof. Abort the first intended save without calling fetch/continue. Keep the gate closed through the real lookup and client assertions; do not unroute after the first abort. Unexpected attempts are blocked and fail the case. Read-only lookup requests remain real and are not matched by the mutation gate.

Record that the handler selected the no-forward branch, no forwarding function/task was started, the route abort completed and the page observed its network failure. Root must correlate zero ingress at the task proxy for this scoped attempt if its inspected logs provide that completeness proof; do not insert an unreviewed identifying header. If interception or ingress coverage is uncertain, no-commit proof is unavailable. There is no application transaction on this path: say `no_backend_transaction_started`, not `rolled_back`.

Only after that settled permanent gate proof, observe O absent and D exactly unchanged. Real lookup(O) must return the inspected missing-operation outcome `unknown`, and the client must retain O/text and uncertainty. The harness knows this attempt never forwarded; the client does not gain that privileged knowledge. Close the browser before removing the gate, await all owned handlers/tasks, and then dispose the dataset.

### 5.6 DRAFT-003-F2 and DRAFT-008-F2

F2 first lets B genuinely commit n+1. A submits stale n, its authentic conflict response is held, and a new snapshot must show A's **recorded conflict receipt** plus unchanged B state. Receive its live proof acknowledgment, then drop that response. Same-O real lookup must return conflict; retain A's local text. An absent conflict receipt is a product gap/failed requirement, not permission to substitute an expired operation or change server time.

For DRAFT-008-F2, establish the uncertainty of 5.4, wait until the real editor has entered it, and reload before resolution. Control only timing of a real pending lookup if needed, with provenance; never fulfill it with invented data. Pass requires the actual application to retain the pending operation identity, query that operation after reload, distinguish persisted F from unsaved L, and match PG. If recovery/persistence is absent, record `failed` with a product-gap code and actual observed behavior; do not relabel a confirmed-save reload or edit the frontend within this task.

## 6. Session-race proof handoff

Task 3 accepted the timing contract in `msg_456064842d78`: fresh baseline before acquiring the lock, lightweight actual lock/wait/transaction acknowledgments during ordering, and final observation only after **both** branches settle. No durable-observer process launch, connection setup, privilege check, heavy snapshot or five-second control delay belongs inside the existing one-second protected-write lock window.

Its private mapping must bind an opaque synthetic session alias to the exact Auth/app session used by the competing requests. Aggregate actor counts alone cannot prove same-session revocation or catch an unaffected second session. Task 3 owns all real backend PID/hash mappings, blocker identities, barriers and transaction-finished signals; public facts expose only exact-session booleans/counts and proof references. This design neither invents those signals nor approves uninspected lock code.

Task 3's later `msg_c931ed10cb95` correctly requires an actual live waiter/blocker witness. The shared private PG adapter may host a **separate preconnected lock-witness primitive**, armed before the race; it is not one of the four durable snapshot queries. Task 3 owns the exact fixed SQL, real backend/transaction registration, visibility requirements, bounded short query deadline, and adversarial witness review. Root owns its implementation and resource/privilege wiring. Return only a matching opaque waiter/blocker proof and phase reference; reject stale/reused backend bindings. A before-acquire callback cannot prove a wait, and a repeatable-read durable snapshot cannot replace this live witness. No suitable existing primitive has been inspected, so its availability remains an explicit implementation gate. Do not increase the one-second lock budget or launch/resolve anything within it. This interface clarification was agreed after consultation; it was not supplied to the three frozen opinions.

## 7. Failure-oriented verification contracts

Each future feature has a happy path and at least two likely failures. These are root-owned Docker tests plus actual UI validation where applicable; none ran in this design task.

| Feature | Happy path | Failure path 1 | Failure path 2 |
|---|---|---|---|
| Seed v2 and lifecycle | Exact nine users/sets verified on new connection, then atomic publish. | Unexpected actor/membership or duplicate alias prevents publication. | Partial Auth/SQL seed, failed verify, or reused dataset leaves no published seed and is fully disposed. |
| Multi-mailbox fixture | Composer sees exact two IDs with distinct capabilities. | Extra/excluded mailbox appears. | Capabilities merge across mailboxes or stale generation causes unrelated authorization failure. |
| Recovery entry | Real Mailpit/staging/acceptance creates the intended session and protected read works. | Consumed/expired entry or replay creates a new accepted session. | Mail absent or token-bearing browser handoff: blocked infrastructure or actual contract failure, respectively. |
| Literal GET | Null/empty/literal UI and complete read-state equality. | New/read/version/timestamp row change after isolated GET. | Active HTML/script/link or external request from hostile text. |
| CAS rejection | B persisted; stale A conflicts and stays local. | A overwrites B or increments version. | UI discards A while DB rejection was correct. |
| Boundary rejection | At-limit accepted; one-past/invalid binding rejected without overwrite. | Truncation/partial save or wrong reply binding persists. | FE-only block mislabeled backend proof, unbounded error, or DB CHECK becomes a 500. |
| Observer/control | Same snapshot actual facts with valid scoped acknowledgment. | Wrong dataset/ID/nonce, stale proof or malformed/oversize frame fails closed. | RLS-hidden known row, disconnect or timeout emits error, never absence. |
| Applied response loss | Commit proof acknowledged before drop; real lookup resolves F and preserves L. | Client/transport abort occurs before proof acknowledgment. | Ledger/draft mismatch, cookie side effect, duplicate forward or n+2. |
| No-forward loss | Permanent gate plus settled absence; client remains uncertain on unknown. | Automatic retry/new operation escapes or ingress cannot be ruled out. | Missing row/timeout is incorrectly called rollback or client mints replacement O. |
| Conflict response loss | Actual conflict receipt observed before drop and lookup returns conflict. | Conflict transaction loses its receipt. | Expiry substituted or local A text overwritten. |
| Uncertain reload | Same O recovered; saved F/unsaved L honest after reload. | In-memory pending state disappears. | UI marks L saved or silently discards it. |
| Session proof handoff | Exact session binding with baseline/final settled observations. | Actor-wide count masks wrong-session revocation. | Observer waits inside lock window or snapshot precedes a branch's settlement. |
| Evidence/cleanup | Root validates proofs, closes streams and seals report; exact disposable resources removed. | Dangling/hash-mismatched or cross-attempt proof is rejected. | Canary/secret-bearing artifact is quarantined; cleanup error retained as failure, not hidden. |

## 8. Small implementation sub-briefs and review slices

Each sub-brief is a separate root dispatch with fresh task-specific opinions if required by project policy. These estimates are review caps, not authority to read unknown dependencies now. Freeze hashes before each pass, review at most 200 lines per assignment and 400 unique implementation/test LOC per reviewer, and split further rather than compress code to meet the cap. Use the full supplied adversarial rubric; formatting belongs to linters.

| Sub-brief | Deliverable / prerequisite | Suggested review passes | Implementer and execution owner |
|---|---|---|---|
| F0: reconcile | Final schema delta including read_state_version; runtime DB/sign/publish, exact loaders and HTTP contracts. No new fixture code until relevant contract is known. | One dependency slice ≤200 at a time, separately assigned where total exceeds 400. | Schema/BE owners; root coordinates. |
| F1: v2 seed | Closed variants, two-mailbox exact sets, two literal fixtures, new-connection verification and atomic publish; failure tests. | Producer/verify ≤180; contract/consumer/test ≤180. Additional consumers get another reviewer. | BE fixture + T0; root Docker tests. |
| F2: observer | Dedicated local-role bootstrap, four fixed queries, private one-shot channel, visibility/failure tests. | Query/protocol ≤180; role/client/tests ≤180. Split protocol from SQL if larger. | BE query owner + root bootstrap/controller. |
| F3: recovery | Real Mailpit/staging case and replay/expired assertions; depends on inspected auth entry and F2 session shape. | Auth/Mailpit adapter ≤160; case/failure tests ≤160. | Root lane owner. |
| F4: read/CAS/bounds | Multi-mailbox, literal GET and draft stale/limit samples with observer invariants. | Read cases ≤180; CAS/limits ≤180; separate regression reviewer if needed. | Root lane owner. |
| F5: transport | Exact route gate and provenance; three distinct DRAFT-003 paths, uncertain reload; no new backend fault API. | Gate/proof integration ≤180; loss cases ≤180; reload separate ≤160. Never assign all three passes to one reviewer. | Root lane owner. |
| F6: evidence/handoff | T0 schema/validator linkage, causal-order checks, task-3 session observer wiring and cleanup; task 3 separately specifies/reviews any live lock witness. | Schema/validation ≤180; handoff/cleanup ≤180. Live-witness code gets its own allocated reviewer if necessary. | Root T0 + task 3. |

Uninspected dependencies are explicit blockers for their dependent implementation: `acceptance_seed_support`/Runtime connection, signer and publisher; final migrations and RLS; `draft_scope`, `context_uuid`, address validation; actual PUT/lookup controllers, digest canonicalization, commit/response ordering, validation/status/byte budgets; Auth recovery/staging/acceptance and Mailpit client; shared seed/config/report schemas/loaders; existing private collector/control channel; pinned Playwright route/cookie behavior and proxy logs; client uncertainty/reload persistence; task-3 session/lock SQL. Do not infer these from this document or the opinions.

## 9. Root evidence integration and completion semantics

Extend the existing T0 `cases.jsonl`/artifact manifest atomically; do not create a parallel acceptance-report format. Required logical fields are fixture identity/hash/variant, pinned code/image/lock/schema identities, engine/version, case/sample/attempt/retry, selected branch, real-versus-mock classification, transport provenance, ordered phase acknowledgment references, redacted DB proof references/digests, complete assertion map, bounded timing, case status, and optional explicit product-gap/error code. T0 owns final field names and closed schemas; this document does not authorize unknown-key acceptance.

Transport evidence records original browser request versus route-fetch relay versus private-proxy gate, forwarded count, response held/dropped phase, unexpected retries/redirects and whether the client's own timeout fired. For no-forward, record permanent gate, zero forward invocations and complete ingress corroboration or an explicit missing-proof status. For after-COMMIT/conflict-loss, validator requires a matching fresh committed proof received before abort. Cross-attempt/operation/dataset references, duplicate proof IDs, path traversal, oversized facts, incomplete assertions and dangling artifacts fail validation.

Proof references point to root-collected **redacted** records, not private payload/credential files. No real email, body, token, password, cookie/header dump, Auth callback URL, storageState or secret-bearing trace is retained in ordinary evidence. Secret canary checks supplement source-time suppression; regex scans alone cannot certify absence of all secrets. Root seals only after all producers are closed and the manifest hashes every retained artifact.

| Meaning | Permitted conclusion |
|---|---|
| Fresh snapshot contains matching applied/conflict receipt and persisted state | That operation committed with the observed outcome before the snapshot. |
| Permanent no-forward control, completed handler, complete ingress coverage, then absent operation/unchanged D | This controlled request never started a backend transaction; this is not rollback coverage. |
| Real lookup returns unknown | Client remains uncertain; no rollback/no-commit conclusion follows. |
| Observer error, timeout, missing acknowledgment, ambiguous ingress or a still-running transaction | Evidence blocked/failed as appropriate; commit status indeterminate. |
| Actual product contradicts a valid case contract | Failed with concrete product gap; do not mark skipped or substitute another case. |
| Prerequisite prevents starting the case | Blocked/not_run under root's existing status rules, with exact blocker. |

## 10. Analytical tradeoffs, cleanup and review accounting

These are analytical counterexamples, **not executed simulations**. The Obsidian connection is unavailable. Assume E engines, C case attempts, seeding cost S, observation cost Q, and K required snapshots. Fresh cases cost approximately E×C×S + K×Q; sharing immutable cases could save seed cost but would require extra proof that sessions, generations, read states and retries never cross cases. For this small unresolved-control wave, correctness and simple attribution outweigh that unmeasured saving. Root can reuse built images while rebuilding disposable data.

| Choice | Analytical counterexample / cost | Decision |
|---|---|---|
| Fresh dataset vs shared stack | Membership/recovery in an earlier case changes the actor-global generation; later unrelated saves fail. Isolated mailbox IDs do not prevent it. | Fresh per case/engine/attempt now; preserve opinions favoring shared draft/read classes as deferred optimization. |
| Files vs socket sidecar | A daemon/socket adds service readiness, mounts, reconnect/replay and cleanup states. Files add atomic-write/sequence rules and process latency. | Small one-shot files in existing private context; reuse an inspected existing channel if simpler. A socket is not forbidden, but needs root evidence of benefit. |
| Dedicated observer vs API-authorized reads | RLS hides a real operation, yielding a false absence proof; an API lookup can return unknown for reasons distinct from physical absence. | Explicit local observer principal and positive visibility self-test; real API authorization asserted separately. |
| Narrow SELECT+BYPASSRLS vs reused administrator | BYPASSRLS remains privileged, but column/table grants and fixed scope reduce exposure; admin reuse unnecessarily increases potential writes/reads. | Dedicated local bootstrap role; no production role/policy changes. Read-only transaction is an additional guard, not a claim that a compromised observer is harmless. |
| Positive commit ack vs status/delay | A response or elapsed time does not establish the row visible from another connection; delayed commit can occur after an absence snapshot. | Same-snapshot ledger/draft proof acknowledged before drop; absence never enough. |
| Combined vs separate proof queries | A writer can commit between a draft query and a ledger query on separate snapshots. | One fresh consistent snapshot per related proof. |
| Permanent gate vs unroute after abort | Client retries after unroute and its second PUT commits, invalidating earlier absence. | Keep gate closed until browser/handlers are closed. |

Root's cleanup sequence: stop new browser actions; settle/cancel owned handlers and leave permanent gates closed; close browsers; close observer transactions/processes; finish/redact/seal evidence; inspect task-owned mounts; remove exact disposable containers, dependency/build volumes, unused task images and task build caches; preserve repositories, credentials, databases/uploads not owned by the attempt and other workloads. Discard the exact disposable fixture data without rewinding generations. If the entire task PG cluster is disposed, its role disappears with it; if the cluster is retained, root must separately revoke/remove only the exact task-owned observer role after verifying ownership and dependencies. Record host/Docker usage and supported trim/compaction outcome where safe under the existing cleanup policy. Cleanup failure is reported explicitly.

This worker created **no Docker resources** and deleted none; reclaimed space is not claimed. Ignored consultation inputs/raw outputs and launch/publish tooling are retained in `ops/local/acceptance-fixture-observer-r1/`; only reviewed opinions and provenance are published. No project-completion deletion protocol was triggered.

Review accounting for the frozen 348 LOC: **0 newly confirmed code defects, 0.00 defects/KLOC; 1 unresolved schema dependency (read_state_version), 2.87 candidates/KLOC**. The already-known private-schema CREATE defect is owned/countable in the schema review, not counted again. Fable 5.1 called the column discrepancy confirmed; this synthesis rejects that severity because later migrations were not supplied. Missing controls are not implemented-code defects. This is not a whole-codebase correctness certification.

Checklist covered: exact source hashes/ranges; nine-actor invariants; null/empty/max constraints; generation and session coupling; least necessary abstraction; deliberate errors and validation boundaries; credential/proof privacy; real transport/commit semantics; bounded query/control costs; happy plus two failure paths; Docker/visual verification ownership; documentation/evidence coupling. Lint/format checks are delegated. Root must copy this review ledger into project `code-reviews.md` and synchronize README/state/documentation with any future implementation commit; this worker was not authorized to edit those shared files.

**Exit gate:** this design may guide bounded implementation after its dependencies are frozen, but it closes no browser acceptance case. Full application acceptance remains **NOT_READY** until the schema prerequisite, source reconciliation, root-owned Docker checks and actual UI journeys pass with sealed evidence.
