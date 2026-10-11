# BE-01-R1 — Astra MAX synthesis

**Accepted for bounded repair implementation, not accepted as a completed fix.** Three successful exact-model opinions cover the same frozen evidence. Use [decisions.md](decisions.md) and [dispatch-brief.md](dispatch-brief.md). No application code was changed or tested by this synthesis.

## Evidence and actual routing

- Task: [issue 6](https://github.com/tanzeel-roseyco/elevateo-mail/issues/6), repairing [incomplete PR 5](https://github.com/tanzeel-roseyco/elevateo-mail/pull/5); parent [BE-01 issue 3](https://github.com/tanzeel-roseyco/elevateo-mail/issues/3).
- Consulted source: `5a9d83ad4de7403f349131bf0c3e45df7fd97c28`. Frozen coordinator context: `ce95e89f505ff7354f558a1c932faec54f5ac377`. Later `f7f3bb75802e152a7942b363a958a0a55a0065cf`, then `eedc43b736791e7e41656d405f10caf3d4164e01`, are coordinator-verified documentation-only changes; they did not replace the source input. The final dispatch records the later operational balance/disk observations separately from frozen consultation evidence.
- Identical common evidence: 348,498 bytes, SHA-256 `a7fd40b1483a10e3f71f7fbef1c949c3ca32758f9776b19d20f3ccd4bd51cb05`. All ten mandatory current documents and 18 pinned source files/665 lines were supplied in full, with hashes. These are consultation context, not a new 665-line code review by this author.
- Actual synthesis runner: native collaboration agent `/root/plan_synthesis`, requested and tool-confirmed `gpt-6-astra`, `reasoning_effort=max`, `fork_turns=none`. Root relayed the successful spawn result; no opaque execution ID was returned. This is execution-tool evidence, not an opinion's self-description. Synthesis date: 2026-10-12 Australia/Sydney (2026-10-11 UTC).
- Full successful outputs, metadata, source hashes and failure records are preserved here. Raw immutable inputs/results remain in `%TEMP%/elevateo-be01-r1-consult-20261012`. All five attempts used fresh processes, safe mode, disabled tools/slash commands and distinct single-turn sessions; no previous opinion was supplied.

| Opinion | Requested and observed firstParty runtime | Session | Verified result |
| --- | --- | --- | --- |
| [F5](fable-5.opinion.md) | `claude-fable-5` | `23c83dcb-f5e5-4d40-98b3-e291ebbdc232` | Exit 0, success, non-error complete result; 98.214 s |
| [O](opus-5-5.opinion.md) | `claude-opus-5-5` | `f0591f74-0fd5-409d-abb3-069ac7a6c0cd` | Exit 0, success, non-error complete result; 146.848 s |
| [F51](fable-5-1.opinion.md) | `claude-fable-5-1`, final retry effort low | `d3888e7d-1d55-48bd-969e-03995643e2ca` | Exit 0, success, non-error complete result; 201.013 s |

Original F51 and its medium-effort retry ended with `error_max_budget_usd`, exit 1 and no result text. They do not count as opinions. The final retry used the same evidence with concise-output instructions and a $6 CLI threshold. Earlier $3 thresholds were exceeded before those calls terminated, so none is represented as a hard billing cap. Reported list cost: successes $7.14925965; failures $7.28809650; total $14.43735615. Actual billing is not independently reconciled; these consultations are separate from the user's Devin-only prepaid-credit authorization.

The newer supplied review record supersedes the frozen question's preliminary density: **712 unique reviewed LOC, nine code defects plus one worker-health standards/acceptance gap; 12.64 code defects/KLOC and 14.04 total findings/KLOC**. The synthesis author's original review remains 170 LOC/four overlapping findings. Do not recount corroboration. The disproved app-meta search-path concern remains closed.

## Section-by-section disposition

Rows group equivalent recommendations without suppressing differences. A = accept, M = adapt, R = reject, D = defer. All required runtime evidence below is **not run**.

| Recommendation / dissent | Source | Disposition and reason | Decision / affected contract | Required evidence |
| --- | --- | --- | --- | --- |
| All ten supplied findings are supported; health is an acceptance gap | F5/O/F51 | A; preserve static versus runtime distinction and nine-plus-one accounting | R1-01; B01-03/04/06/07 | V01 reproductions; V11 health |
| Own real outer transaction; reject unrelated ambient transaction | All | A; a savepoint does not end local authority | R1-02; B01-04 | V03 ambient, commit, rollback |
| Save/restore prior tenant settings | All discuss against | R; adds aborted-transaction/callback restoration states with no present caller need | R1-02 | Rejection before settings/yield |
| Bind nesting to principal, connection and transaction | All | A; identical principal alone is insufficient | R1-02 | Different principal/connection/replaced transaction reject |
| Allow transaction ancestry/savepoint-chain nesting | O | R for wrapper re-entry; exact identity is the smaller contract. Normal savepoints inside the block remain possible | R1-02 | Exact nesting positive; descendant re-entry negative |
| Execution-local marker, no async propagation | O; compatible F5/F51 | A; an unrelated fiber with an open leased transaction fails safely | R1-02 | Pool reuse and two-thread/two-connection tests |
| Adapter-bound setting query addresses lazy-transaction uncertainty | O | A; explicit materialization via the adapter without claiming raw PG is a newly confirmed defect | R1-02 | Read-back inside actual transaction |
| Clear entry/exit plus uncached, restore enable flag | All | A; pinned APIs checked, executor proof still needed. No restoration of old cached rows | R1-02 | V04 identical SQL/binds under A/B/unwrapped and exception |
| Disable cache globally or invent tenant-keyed cache | O alternative / F5 rejects new cache | R; bounded boundary is sufficient and keeps normal caching behavior | R1-02 | Prior enabled/disabled state preserved |
| Require post-block setting strictly NULL | F51 example | M; NULL or empty is possible; require no effective stale authority | R1-02 | Settings plus denied unwrapped reads |
| Remove bootstrap runtime grant; one additive grant migration | All | A; never edit applied foundation history | R1-03; B01-03 | V06 fresh and retained-volume paths |
| Narrow owner ADMIN, no broad migrator privilege | All | A, with INHERIT/SET false on administrative edge and explicit runtime-edge options | R1-03 | Flags and inability to SET privileged roles |
| A different admin-capable grantor can revoke legacy membership | F5 | R; grant provenance matters. Generic CREATEROLE is not the selected authority | R1-03 | Exact pg_auth_members grantor before/after |
| Privileged bootstrap retires only legacy edge; owner migration manages its own | O/F51 | M; expected grantor is verified on the pinned legacy fixture, not assumed to be the connecting username. Unknown edges fail; no broad revoke/CASCADE | R1-03 | Legacy transition, owner edge survives bootstrap, down stays denied |
| B01-03 needs a refinement versus already permits prerequisites | F5/F51 versus O | M; explicitly clarify prerequisite ADMIN authority and one-time legacy retirement while preserving the original migration-ownership invariant | R1-03 | Coordinator ADR/doc reconciliation |
| Keep runtime membership in bootstrap as smaller deviation | F51 rejected alternative | R; revocations would again be undone | R1-03 | Bootstrap-after-down regression |
| Explicit per-service secret matrix; interpolation-only env file | All | A; include separate privileged fixtures and restricted API/worker tests | R1-04; B01-05 | V07 key/DSN/mount absence and valid own-role access |
| Refactor Config or pre-add API Storage credential | All caution against | D until actual need; existing own-role lookup stays; future adapter gate remains | R1-04 | Current key absence; no future adapter-complete claim |
| Valid existing credentials are a byte/metadata no-op; invalid fail | F5/O; F51 wording ambiguous | A; reject any reading of F51's otherwise branch that replaces a partial existing target | R1-05 | V08 valid/invalid, hash/permissions and retained-DB compatibility |
| Verify existing grammar and JWT consistency | O | M to existing supported format, bounded parsing and redacted errors; no unsolicited rotation/expiry policy | R1-05 | Format/signature mismatch preserves file |
| Same-directory temp + flock/rename | F5 | R as final installation choice; create-only exclusive linking avoids lock lifetime and overwrite races | R1-05 | Concurrent creation and failure injection |
| Fixed O_EXCL temp acts as lock, stale temp blocks retry | F51 | R; unique temporary files plus exclusive publication need no manual stale-lock recovery | R1-05 | Interrupted run leaves no partial target |
| Exclusive File.link publication and no clobber fallback | O | A; chosen over replacement because existing credentials must not change | R1-05 | Actual host bind-mount support and race tests |
| Linux container means Windows filesystem semantics irrelevant | F5 | R; host bind mounts still matter. F51/O platform caveat retained | R1-05 | Windows evidence separately required |
| Use timestamp worker health rather than DB/job probe | All | A; classify as liveness only | R1-06; B01-06 | V11 live, stopped and stuck loop |
| Reuse direct heartbeat writes/to_i/freshness-only expression | F5/F51; O expression also accepts future time | M; atomic publication, strict bounded parse and nonnegative age prevent partial/malformed/future false health | R1-06 | Malformed/future/stale negative cases |
| Docker pause proves stuck-loop probe; add hold to heartbeat | O | R pause as proof because probe is paused too; D extra hold payload. Use process SIGSTOP and existing hold checks | R1-06 | Probe actually executes while loop is stopped |
| In-target interpreter prerequisite checks | F5/F51 | M to pinned probe sidecars sharing target network namespace; no third-party image modifications | R1-07 | Probe validity/local TCP positive control |
| Private bridge probe plus Internal property is enough negative evidence | F5 | R; keeps the behavioral blind spot. Structural checks supplement, not replace, the external-route test | R1-07; B01-06 | Same endpoint reached when equivalent confinement is removed |
| Gateway-published fixture and unrestricted control | O/F51 | M to E gateway outside target subnet; target's own gateway can remain reachable even on internal networks | R1-07 | Actual engine/DNAT positive control, no Internet |
| Only explicit no-route counts; timeouts/setup failures do not | O; others compatible | A; Docker exit failure is never evidence of blocked traffic | R1-07 | Missing target/probe, timeout, refusal, malformed-result failures |
| Equivalent internal/open network pair, checker open result fails | O/F51 | A; cheaper than second full application stack, while preserving behavioral sensitivity | R1-07 | V09 two controls plus real runtime namespaces |
| Unique labels, successful-create IDs, verified owned cleanup | All | A; include collision, partial setup and interruption tests | R1-08 | V10 foreign resources unchanged |
| Minimal fixtures/test profile; executor cache, legacy grant and secret allowlist tests | All | A; separate privileged seeding from restricted behavior; add small concurrent pool test | R1-08 | V02–V12 |
| Fault injection via production environment hook | O candidate | M to test-only runner/filesystem seam; no new runtime kill switch | R1-05/08 | Injection unavailable in normal generator invocation |
| Missing seed/check lifecycle services should be finished | O candidate observation | D full lifecycle to BE-01; add only the R1 harness needed for real regressions. Not a new reviewed defect count | R1-01 | Honest remaining BE-01 status |
| Two, three or four commits; commit under 200 lines | F5 / O / F51 | M to three coherent units A/B/C. 200-line review slices do not force arbitrary commit splitting; membership stays with authority repairs | R1-01 | One writer, all changed lines independently reviewed |
| Fix only P1s or split into independent tasks/gates | Alternatives discussed | R; all ten were consulted together and broken evidence would contaminate later checks | R1-01 | V01–V13 all required before repair closure |
| No frontend/native expansion, no Obsidian claim, no full BE completion | All | A | All | Pending real product integration remains explicit |

## Supplemental verification after the frozen packet

The following primary-source readings informed this synthesis after collection began. They were not inserted into the immutable input or attributed to the consultants as supplied evidence.

PostgreSQL 17 distinguishes the grantor on a role-membership edge; a superuser's membership grant is attributed to its bootstrap superuser. Granting narrow ADMIN authority does not make an unrelated grant disappear. This supports explicit provenance checks and rejects the generic revoke assumption. [GRANT](https://www.postgresql.org/docs/17/sql-grant.html), [REVOKE](https://www.postgresql.org/docs/17/sql-revoke.html).

Exact Rails 8.1.4 source confirms adapter `uncached(dirties: true)` and `clear_query_cache` forwarding to the pool, and restoration of the cache-enabled state in the block API. It does not replace the executor/pool regression. [Pinned query-cache implementation](https://raw.githubusercontent.com/rails/rails/v8.1.4/activerecord/lib/active_record/connection_adapters/abstract/query_cache.rb).

Docker documents that an internal network has no default route while its own gateway and host services on that address can still be reached. Therefore the fixture must be outside the confined subnet, and real positive/negative controls must establish the actual engine path. [Internal-network behavior](https://docs.docker.com/reference/cli/docker/network/create/), [bridge publication and isolation](https://docs.docker.com/engine/network/drivers/bridge/).

These sources settle design choices, not pinned-image grantor results, filesystem support or Docker Desktop behavior. Those are mandatory implementation proof obligations.

## Analytical tradeoff scenarios

| Scenario | Chosen behavior and cost | Rejected alternative / residual uncertainty |
| --- | --- | --- |
| Caller opens transaction, enters A, then reads unwrapped | Reject entry before authority changes; callers compose inside the wrapper | Savepoint plus marker cleanup leaks authority into caller transaction |
| Executor caches A, then B reuses connection/SQL | Entry clear, uncached body, exit clear; sacrifices cache hits at authority boundaries | SQL RLS alone cannot protect a query answered by Rails cache |
| Bootstrap follows migration down on retained database | Legacy edge absent, owner edge remains revoked; API denied | Reapplying old grant silently undoes versioned authority |
| Two first bootstraps race; one crashes before publication | Complete file has one winner; owned temporary files can be removed | Truncation or replace-on-race can invalidate persistent service credentials |
| Confined and unconfined container both fail sibling-bridge probe | Test is invalid; require a reachable external-route control and open checker failure | Structural flag alone does not demonstrate behavioral sensitivity |
| Fixture name exists or creation fails halfway | Abort and clean only captured, label-verified IDs | Static-name traps may delete another task's resources |

These are analytical simulations, not an Obsidian connection or executed tests. Obsidian remains unavailable. No source-review coverage or runtime pass is inferred from them.

## Handoff and outstanding work

Actual Astra LOW implementation identity, checkout/base and branch reservation must be recorded at dispatch. The coordinator reconciles B01-03/ADR, source/density status, README Current state and other shared documentation in the same implementation commit; this author owns only the R1 evidence folder. Root may start independent FE repair preparation when its separate evidence is ready, but these opinions do not cover FE-R1.

The repair design gate is complete. V01–V13, actual grantor transfer, Windows filesystem/network evidence, required checks, independent reviews and issue closure are pending. Any incompatible privilege/filesystem/topology result returns to this gate instead of weakening the invariant. No new live activity or Devin continuation follows automatically.
