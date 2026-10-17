# BE02 bounded collaboration test repairs

Dispatch: task_661a9fb7db18 / ctx_ed51d0779bef; run run_5cc7ae2ab900.
Scope: six assigned test files only, plus this report. C/D 1.0.0-collaboration.1 unchanged. No production changes, commits, agent calls, or runtime tests.

## Findings addressed

- CH01: all three write routes now receive valid JSON plus legal whitespace at the exact byte cap and cap+1. Controls cover honest lengths, a forged length equal to the complete JSON prefix, and omitted CONTENT_LENGTH. Over-limit rejection asserts no auth client calls, pool checkout, transaction events, or SQL; each at-cap control must succeed and commit.
- CDB1: admin business-row reads, counts, and version updates use fixture organization/mailbox/thread identifiers (and actor where applicable). Max-version tests create another tenant's read/assignment rows and verify their full rows remain unchanged.
- CDB2: initial state responses require the closed key set and fetch explicit nullable fields. Unread must equal false, not merely be falsey.
- CDB3: both mailbox/thread pairs are independently readable before testing a cross-paired thread/mailbox. Rejection requires the generic 404 and leaves original, cross-paired, and second mailbox business rows unchanged.
- CDB4: the same parameterized INSERT shape first permits the current author, then rejects another author with PG::InsufficientPrivilege and SQLSTATE 42501. The permitted row persists and the denied row does not.
- R1: no-op assertions retain state, version, and timestamp; maximum-version no-ops succeed unchanged, while actual changes return 503 temporarily_unavailable without persistent mutation. Service assertions also constrain expected SQL call counts.
- R2: UUID fixtures contain alphabetic hex digits and explicitly differ after uppercasing. Uppercase create/replay inputs must produce canonical lowercase response identifiers and SQL bindings.
- Lock evidence: waiters must name the intended blocker through pg_blocking_pids. The read race uses two distinct local cookie rows for the same actor, observes blocking before any business row exists, and checks separate backend PIDs. A generic Lock event is not accepted as generation-guard proof.

Seven numbered review findings addressed; zero runtime-verified fixes claimed. Source scope is 891 physical lines, giving an addressed-finding density of 7.86 per 1,000 scope lines; this is not an independently measured residual defect rate.

## Exact changed-source manifest and bounded review allocation

Paths below are relative to the project. Each proposed reviewer owns at most 400 physical lines, and each pass at most 200. These are pending review allocations, not completed adversarial reviews.

| Path | Lines | SHA-256 | Reviewer / passes |
| --- | ---: | --- | --- |
| apps/server/test/be_02/collaboration_controller_test.rb | 115 | 824133c3f2f731be0c92355b619bac89f65e78754394240a557b2c1276efc09d | HTTP: 1-115 |
| apps/server/test/be_02/collaboration_controller_helper.rb | 92 | af4d2ce8e4dca289782f23d1ffc4f1d6e4d0e062c3c36ec3c9c604ee55c447e8 | HTTP: 1-92 (207 total) |
| apps/server/test/be_02/collaboration_database_test.rb | 183 | c45a685feda972497e8089ee016dd890c1abb8c9f5aebaa95ca193535755c8ba | Database assertions: 1-183 |
| apps/server/test/be_02/collaboration_database_helper.rb | 221 | ed14323962ffa2258addd7432928f8284ce74218ba8ed9e49001555eb3d50b58 | Database fixtures: 1-200; 201-221 |
| apps/server/test/be_02/collaboration_services_test.rb | 163 | 604ed91e2413ce1df23412822e2ce797d7b5e715723817be334e43c6b07831e1 | Service/race: 1-163 |
| apps/server/test/be_02/collaboration_concurrency_test.rb | 117 | 0e4aa70031d8a82a4efeb9cb3ed229e64eabe9fa607ab6afe3bd3e5e805722aa | Service/race: 1-117 (280 total) |

The seventh changed path is this report; its final hash is supplied in the coordinator completion message to avoid a self-referential hash. All six test files were already untracked in this shared checkout; no staging or ownership reset was performed.

## Evidence and remaining work

Runtime: **NOT_RUN**. No Docker, host Ruby, syntax-check execution, or application testing was performed under this dispatch. Static inspection checked the repaired assertions against the existing service, fixture, guard, and controller interfaces. Source reviews consulted: review-be02-collaboration-http.md, review-be02-collaboration-database.md, review-be02-collaboration-races.md, and review-be02-collaboration-design.md in the coordinator's Local Completion checkout.

The coordinator must run Docker tests and any mutation checks, confirm the missing-length request behavior in the actual supported server adapter, and arrange independent bounded review. The in-process Rack harness supports removal of CONTENT_LENGTH; that is not transport-level evidence. Blocking evidence is asserted by authored tests but has not yet been observed at runtime. Cursor behavior/tests remain owned by the separate cursor repair worker; this patch makes no cursor, service, input, or deadline edits. Root documentation and code-reviews.md aggregation remain coordinator-owned.
