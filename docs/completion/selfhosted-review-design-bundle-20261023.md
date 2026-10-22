# Self-hosted Bundle and recovery design review — 2026-10-23

Task `task_5452fc9eb62a`, dispatch `ctx_907eda6ee28d`. Bounded read-only adversarial design review; only this report written. Outcome: two MEDIUM defects, fixes and fleet regressions pending. This is not production or whole-project approval.

## Exact coverage

| Source | Inclusive lines / physical LOC | SHA256 |
| --- | ---: | --- |
| `ops/selfhosted-mail/export_bundle.py` | 1–88 / 88 | `701f5e03065ef001a04f2e53c22b42a9d4ab6dbeca0af6d8b9ef25372cbdf10c` |
| `ops/selfhosted-mail/runtime_acceptance.py` | 1–70 / 70 | `02c2c7f3af2a9f27d56d21d73b590f0a8bdb70155170e5a4e059f82e9b55c077` |

Total: **158 physical LOC, 2 defects, 12.66 defects/KLOC**. Exporter: 1/88 = 11.36/KLOC; acceptance: 1/70 = 14.29/KLOC. Physical counts include blank/comment lines. Source may change concurrently; these verdicts apply only to the hashes above. Imported implementations and test sources were not reviewed; no transitive coverage claimed.

Completion checkpoint observed concurrent source changes: exporter now hashes `72e367f0526587145e212ccceed0ad81524982b9a89ff8acded95c9c7d2d2474`; acceptance now hashes `b1c82d1edb350daf14fde7896b252294f9f703a7c6762d7a6c9644abb2df83fe`. Those newer bytes were not reviewed. Findings/counts above describe the original packet, not an assertion that the newer source retains the defects or repairs them successfully.

Context: current README/state/documentation launch sections, `.planning/STANDARDS.md`, self-hosted README and completion/infrastructure/initialization reports. Applied the supplied correctness/security/design rubric, with formatting left to normal linters.

## Findings

### D1 — MEDIUM: final Bundle is published before it is complete

`export_bundle.py:78–82` creates the final consumer pathname using O_EXCL and writes directly into it. This protects against overwriting existing files and starts with mode0600, but does not provide atomic publication. A concurrent resolver can observe empty or partial JSON; a crash, ENOSPC or fsync failure leaves a final pathname containing incomplete credentials, and an ordinary retry then fails O_EXCL. Even successful file fsync does not durably commit a newly created directory entry across power loss.

Simplest fix: write a uniquely named mode0600 temporary file in the same private directory, flush/fsync it, atomically publish it with a no-replacement operation (for the Linux target, linking the completed temporary inode to the final name preserves exclusivity), fsync the parent directory, and remove the owned temporary name. Do not replace O_EXCL with an overwrite-capable rename that silently replaces a live Bundle. Handle post-publication failures explicitly so a retry can distinguish a complete published result from failure before publication.

Fleet regressions to request: inject write/fsync failure and verify no incomplete final file exists; concurrently read during delayed writes and verify only absent/complete output; race two publishers and prove one winner without replacement; preserve existing output and private modes.

### D2 — MEDIUM: optimized Python removes binary identity enforcement

`runtime_acceptance.py:21–24` uses assert for the pinned executable hash. Under `python3 -O` or `PYTHONOPTIMIZE`, that assertion is removed; the harness then runs a mismatched binary and can produce passed=true if subsequent behavior matches. Recording the observed hash does not enforce the admission rule.

Simplest fix: explicit comparison raising a deliberate exception before any executable invocation. Request a fleet regression with optimization enabled and a mismatched digest, proving failure before version/configure/start. No dependency or generalized admission framework is needed.

## Checklist and concrete design simulations

| Area | Source conclusion and failure simulation | Simplest operational/design response |
| --- | --- | --- |
| UUID authority | Lowercase UUID syntax is checked; no IDs are invented. A syntactically valid foreign organization/mailbox tuple is still accepted offline. This is operator metadata, not proof of SQL ownership or active status. | Keep SQL the authority. Produce metadata from a scoped authoritative query and validate the exact tuple at secret resolution/dispatch. Treat source revocation and source receipt as activation gates. No database client needs adding to this offline exporter. |
| Tenant/version/protocol binding | Exact field sets, bounded integer version, production secret-ref syntax, manifest usernames, endpoint TLS policy and SMTP/IMAP pairing are checked. Same username cannot vary its identity across protocols; identical identity cannot alias another username. Different versions/refs/IDs can describe a repeated underlying mailbox without these files knowing its SQL relationship. | Require SQL uniqueness and current org/mailbox/account/version/ref lookup; do not infer those relationships from UUID shape. Pair validation is useful structural defense, not authorization. |
| Null/empty/max inputs | Empty/non-list entries fail; 2..240 entries bound work. UUID nulls, bool versions, wrong ports/modes, missing/extra fields and credential mismatches fail. At most120 usernames means repeated account-index lookups are small and bounded. | No performance abstraction justified. Imported loader/manifest/private-path checks remain separately reviewable dependencies. |
| Rotation/revocation | Exporter comment requires prior SQL revocation but cannot enforce it. Scenario: old Bundle remains mounted while new version is exported; direct SMTP/IMAP passwords and established sessions can outlive app membership changes. | Freeze dispatch, revoke/fence the old SQL binding, rotate Mox credentials and address existing sessions, provision new exact version/ref, publish privately, then independently verify old denial/new success. Keep failures held; do not label a new file alone as successful rotation. |
| Atomic/private output | Own output uses0600, no-follow and exclusive creation; passwords are not printed. Crash/partial-write atomicity fails as D1. Private-root helper behavior and parent race resistance were not reviewed. | Apply D1 and retain encrypted storage, private root and private evidence access. No credential material should enter the report. |
| Paused deployment | Exporting a file does not enable accounts or send mail. Neither reviewed module asserts application dispatch hold, Mox queue hold or production firewall state. Runtime report network=none is a literal declaration, not an isolation probe. | Require container/network receipts and held configuration checks from the launcher/configuration reviews. Keep app dispatch, server outbound policy and network egress independently held until acceptance. A successful private fixture run cannot authorize activation. |
| Snapshot meaning | Harness exercises mail, snapshots, stops before verifydata, verifies original restart and starts a copied restored root. Two sentinels demonstrate bounded populated persistence if imported checks work; snapshot config/data are copied, TLS comes separately from original root. | Call this a local isolated restore drill. It does not establish encrypted off-host survivability, signing-key/TLS recovery from a lost host, full account coverage, application DB/Storage recovery, RPO/RTO or120-user capacity. Test loss of original host with independently escrowed assets before those claims. |
| Dedicated versus shared host | Dedicated host reduces resource, reputation, protocol-port and restart blast radius at extra host/backup/monitoring cost. Shared fleet saves one host but competes for disk/memory and shares failure/maintenance domains. These modules reserve no resources. | Keep documented dedicated-host default. Simulated burst consumes remaining shared disk: mail acceptance and unrelated app storage can fail together; separate disk quotas/reserves and exact port ownership are prerequisites to any consciously selected shared-host exception. No new platform needed. |
| Failover/unknown/no-replay | Scenario: SMTP DATA is durably accepted but final response is lost, then old app DB and Mox queue are restored independently. Neither module reconciles durable attempt state or proves that replay is prevented; sentinels alone cannot establish this invariant. | Keep ambiguous sends unknown, outbound held, and one active mail writer. Reconcile app attempt ledger, credential generations, mailbox UIDVALIDITY/cursors and Mox queue before promotion; never infer retry safety from absent post-backup records. Add a separate lost-ack/crash/restore integration scenario. This is an evidence gap, not a claimed defect in the narrowly scoped local message-restore drill. |
| Error behavior | Export validation occurs before output creation. Runtime exceptions record failure type and rethrow. Cleanup/report writing can itself fail; passed=true is assigned before final stop/report/log copying. | Gate acceptance on process exit plus fresh complete report and cleanup receipt, rather than the JSON boolean alone. Imported stop semantics and orchestration evidence are outside coverage. |
| Maintainability/docs/tests | Small modules have bounded responsibilities and useful intent comments. No additional service/framework is justified. README explicitly leaves production secret adapter/activation/offsite recovery blocked. | Add precise exporter/acceptance instructions and scope claims alongside implementation. Regression/test-source coverage was not inspected under this two-file-only assignment; no test adequacy or runtime PASS claimed. |

These are prose failure simulations based on inspected code, not executed experiments. **Obsidian MCP connection unavailable:** no Obsidian tool was exposed in tool discovery. No Obsidian simulation, vault write or synchronization occurred.

## Limits and handoff

No host/container tests, builds, mail, cloud/DNS operations, credentials, nested agents or commits. No disposable Docker resources created; cleanup is inapplicable. Actual reviewer billing/model identity is not independently audited. No general source release claim follows from this review.

Immediate findings were durably sent to coordinator (`msg_83c2bcd85470`) and owner dispatch `ctx_07b8e333216d` (`msg_a717c1f4b328`). Coordinator owns central `code-reviews.md` and global state updates; this dispatch is authorized to write only this report. Fixes require separately hashed rereview and fleet-only regressions.
