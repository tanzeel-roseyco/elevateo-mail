# Astra MAX recommendation dispositions

All three opinions were independently read in full before synthesis. These decisions apply to [the accepted repair brief](../../../../docs/completion/be02-migration-schema-design.md); preserved opinion SQL is advice, not approved implementation. Requested/effective Astra identity is evidenced in metadata. Obsidian was unavailable; alternatives were evaluated through the report's analytical state schedules.

## Fable 5

| Recommendation | Disposition | Reason / bounded adaptation |
| --- | --- | --- |
| R1: bootstrap creates schema, validates exact owner, revokes PUBLIC then checks ACL | **Adapted** | Accept bootstrap ownership and owner guard. Explicitly create only if absent; reject the pre-guard revoke because it hides PUBLIC drift. Existing valid ACL representation must survive |
| R2: replace tables CREATE with migration prerequisite | **Adapted** | Accept first-operation preflight; use one new SQL part through the existing loader for both directions. Remove schema REVOKE as well |
| R3: bootstrap configures; migration asserts only; duplication preferable to a general helper | **Accepted with bounded reuse** | No runtime repair or persistent helper. Bootstrap is an independent guard boundary; migration up/down reuse a single local SQL assertion asset |
| R4: normalize NULL/default ACL semantically, inspect unknown grants/effective access and owner permissions | **Adapted** | Independent owner check, owner-only grantee/grantor, two separate owner CREATE/USAGE checks. Reject the combined-privilege positive test, which proves only OR |
| R5: valid nonempty bootstrap reruns are no-ops; wrong owner fails atomically | **Accepted** | Assert OID, ACL representation and row preservation; actual PostgreSQL transaction tests required |
| R6: down retains namespace; explicit object drops; optional preflight and destructive ledger rollback | **Adapted** | Retain schema and scope drops. Require the same guard before down to fail closed on privilege drift; no namespace emptiness requirement |
| R7: assert before DDL and verify Rails transaction behavior | **Accepted as a requirement** | The opinion's inference that the current failure is already fully atomic is not accepted as runtime evidence; prove actual rollback and schema_migrations state |
| Default-privilege test: require no future table runtime grants | **Deferred in part** | Namespace postcondition is in scope. Do not impose a zero-row pg_default_acl rule; existing table/function defaults and grant paths need separately bounded inspection and regression evidence |
| Fresh path, wrong owner, PUBLIC/unknown grants, inherited reachability, missing schema and runtime denials | **Accepted with corrections** | Use actual login connections and dependency-aware rollback order. Test partial owner revocations separately and compare state after failure |
| Database CREATE/admin migration/all-DDL-bootstrap alternatives | **Rejected as proposed fixes** | Fable's recommendation to reject these alternatives is accepted: each broadens authority or lifecycle scope |

## Opus 5.5

| Recommendation | Disposition | Reason / bounded adaptation |
| --- | --- | --- |
| R1: bootstrap CREATE IF NOT EXISTS, revoke PUBLIC, guard | **Adapted** | Bootstrap creates explicitly when absent, then checks. No revoke/owner alteration before the assertion; fail on drift |
| R2: exact owner, semantic ACL, owner grantor/grantee, separate CREATE/USAGE, implicit owner grant options | **Accepted** | These prevent silent adoption, foreign rights and owner privilege loss without requiring a textual ACL representation |
| R2: reject every namespace pg_default_acl row; add effective access checks | **Partially accepted** | Accept effective API/worker/app_read denials and existing graph guards. Reject blanket default-ACL prohibition; harmless hardening rows can exist, and schema rows alone miss global defaults |
| R3: migrate only after prerequisite, additionally require empty namespace, retain revoke | **Adapted / partly rejected** | Accept preflight. Reject namespace emptiness and redundant revoke: the bootstrap namespace can contain preserved unrelated objects; task DDL already rejects name collisions |
| R4: retain namespace, assert owner/emptiness afterward; avoid full ACL pre-down guard | **Adapted with dissent** | Retain and drop only listed task objects. Require contract before down; reject blanket emptiness and post-only validation. This favors fail-closed data handling over recovery through drift |
| R5: duplicate exact predicate text, no helper; static text-comparison test | **Adapted** | Shared semantic contract at bootstrap/migration; one migration-local SQL part reused by up/down. No persistent database helper. Real behavior tests matter more than brittle byte-identical SQL checks |
| R6: separate administrative bootstrap, production provisioning and Rails object migrations | **Accepted** | This repair is for authorized local disposable workflow. It neither runs production provisioning nor authorizes production activation |
| R7: real PG lifecycle, owner/ACL drift, runtime denial and role-preservation tests | **Accepted with limits** | Add partial revocations and actual migration entry. Reject dangling-role synthetic catalog manipulation and zero-default-row/emptiness assertions; no test should invent invalid catalog states |
| Follow-up: app/app_meta have IF NOT EXISTS without owner assertions | **Deferred** | Visible pattern merits a separate bounded issue; no expanded repair or claim of an observed failure here |
| Move ledger to existing app schema / administrator migration alternatives | **Rejected as proposed fixes** | Larger privacy/reference change or broader authority outweighs the few source lines saved |

## Fable 5.1

| Recommendation | Disposition | Reason / bounded adaptation |
| --- | --- | --- |
| R1: bootstrap CREATE and add schema to existing PUBLIC revoke; fail on foreign ACL | **Adapted** | The recommendation contradicts its own reject-drift objective. Remove pre-guard revoke from accepted design; explicit creation branch followed by invariant assertion |
| R2: first migration assertion, retain revoke as no-op | **Adapted** | Accept first preflight, reuse SQL part both directions, remove schema mutation. A semantic no-op can still materialize NULL ACL and weakens assertion-only responsibility |
| R3: same predicate in both entry points | **Accepted semantically, proposed SQL rejected** | Its owner test is inside ACL expansion, so empty ACL can remove the row being tested. Combined CREATE/USAGE is OR. Test owner independently and require both privileges separately |
| R3: reject owner grantable entries and all namespace default ACL rows | **Rejected** | Owner grant options are implicit; ACL representation and harmless default hardening are not themselves privilege leakage |
| R4: down retains schema and asserts no pg_class/pg_proc remain | **Partly accepted, dissent retained** | Retention accepted; emptiness rejected. A partial object-catalog enumeration is not equivalent to PostgreSQL RESTRICT and conflicts with retaining unrelated bootstrap-namespace objects |
| R5: require current_user owner | **Accepted and extended to down** | Prevent accidental superuser-owned task objects and enforce intended execution boundary in both directions |
| R6: keep app/app_meta owner guards out of this patch | **Accepted** | Record untriaged follow-up, preserve scoped change discipline |
| R7: root inventory of other CREATE SCHEMA statements | **Accepted as follow-up inspection** | New <=200-LOC assignments required. Do not automatically move all discovered schema creation into bootstrap without its own lifecycle evidence |
| Regression cases: bootstrap rerun, owner/ACL/default drift, wrong actor, rollback | **Adapted** | Real production entry points, actual role logins, partial owner privileges and retained sentinel. Replace default-row prohibition/stray-object rollback rejection with accepted behavior |
| Bootstrap BEGIN/COMMIT cannot be safely nested in a rollback-only test transaction | **Accepted** | Use separately isolated disposable states or verified restoration. Assert failed transaction state before cleanup |
| Existing-schema relocation or privileged creator function alternatives | **Rejected as proposed fixes** | Cross-file/reference risk or added privileged interface exceeds the bounded repair |

## Explicit dissent and evidence corrections

All three models support administrative schema creation and runtime assertion. None is accepted verbatim: all suggest an early PUBLIC revoke somewhere, which would defeat the requested drift detection. Fable 5's positive owner test and Fable 5.1's proposed predicate use a comma-separated privilege list; PostgreSQL defines that as any privilege, not both. Fable 5.1 additionally ties owner verification to an ACL expansion that can return no rows. These are proposal defects, not additional discovered source defects.

Opus and Fable 5.1 favor an empty private namespace on rollback; the synthesis preserves unrelated objects instead. The accepted migration owns specific objects inside a bootstrap-owned namespace, and existing non-CASCADE drops still guard their dependencies. The report requires tests for a retained unrelated sentinel and for a failing dependent object, making that tradeoff observable.

Fable 5 treats full pre-down checks as optional; Opus warns they can obstruct recovery. Synthesis requires the contract in both directions because this task does not authorize silently rolling back a drifted security boundary. An administrator must address drift separately. No blanket guard is added for all database defaults or all other schemas.

The accepted small SQL part is a file-level reuse through the existing loader, not a persistent function, generalized helper framework or new dependency. It makes up/down use one migration predicate while preserving separate administrative bootstrap validation. Tests should establish semantic parity across entry points rather than merely matching text.

Opinion statements about transactional outcomes, later migration success, test completeness or source outside the packet remain predictions. Fable 5.1's reference to four supplied slices is a counting error: the manifest has three groups, 148/84/168, totaling 400 unique implementation/test LOC. Root's later concurrency message was not in the common packet and does not cure the failed migration.

Source defect accounting remains **1 / 400 LOC = 2.5 defects/KLOC**. Advice corrections do not inflate that count. No model-identity gap remains, and no application runtime pass is claimed.
