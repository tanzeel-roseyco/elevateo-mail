# ADV151 — suite coverage design

Exact Orion1aebd99be9cee3efc80eba9d3105db33e0e318f0, ops/tests/be02/test-suites.sh1–53 and docs/completion/orion-test929.md. **53 unique source LOC,0 confirmed defects,density0/53=0 per KLOC.** Source-only; no tests/builds/Docker/source edits. Inventory139=130 standard+9 dedicated is supplied document evidence, not independently re-enumerated here. Runtime remains Soren-only.

## Admission

Bash globstar/nullglob discovers matching files recursively. Required core suites and a nonempty standard selection fail closed. A new top-level directory fails classification before any suite runs. Existing admitted directory patterns intentionally include newly added files and nested paths; they do not classify each new file's environment needs. Therefore a new special-role fixture inside an admitted directory still requires its author to update classification. The historical R1 directory blanket-defers any future file there; deferred output makes that visible but does not prove execution. This is a documented maintenance boundary, not a confirmed current misclassification.

## Standard execution

Each file receives a separate Ruby process, preventing Ruby/controller state leakage. Individual nonzero exits/timeouts increment failure; execution continues to capture later failures. Steep and RuboCop failures also count; final exit is nonzero if any failed. Quoting array paths preserves filename boundaries. No skips are disabled or converted to errors by this script: the evidence reviewer must reject prerequisite-dependent skipped cases as coverage.

Process isolation does not isolate the shared database, role, fixture state or environment. Standard grouping is justified only for suites compatible with the API-role BE02 service and full migration state. The report explains the known exceptional roles/URLs, but individual suite sources and inherited cleanup were not read. Current grouping is not actual-role proof.

## Dedicated follow-through

Maintain a release gate ledger on the exact integrated SHA, separate from standard runner success:

1. Four be_01_r1 files: dedicated00001/00002 disposable snapshot with matching API/worker/migrator sessions. Record each exact file, role, exit/case/assertion/skip counts.
2. attachment_gateway/migration_acl_test.rb: task migrator session plus private schema bootstrap, reversible migration assertions and exact cleanup.
3. attachment_gateway/authority_database_test.rb: dedicated restricted gateway login URL/bootstrap, actual DB identity and positive/denied tuple proofs.
4. attachments/database_test.rb: task ATT823 admin/migrator/API/worker URLs and explicit identities.
5. campaigns/database_test.rb: task OUT804 admin/API URLs and identities.
6. send_worker/mailpit_protocol_test.rb: isolated Mailpit, explicit SEND811_MAILPIT_PROTOCOL=true and protocol cases actually executed.

Soren owns scheduling/execution and cleanup; owner supplies prerequisites. Nine deferred files are not nine skipped proofs. A130-standard PASS must be labelled standard coverage, and full139 coverage requires all nine dedicated results. Later feature144 inventory must be reconciled to that later source rather than transferring core counts.

## Budget and design tradeoffs

Per-suite90-second deadlines plus180 Steep and90 lint are safe failure bounds, but they do not establish compatibility with the report's480-second outer lease.130 sequential startups can exhaust that lease even when each suite is healthy. Record elapsed time and incomplete file list; if the outer budget prevents completion, Soren should extend the bounded lease or split explicit immutable-source batches with one ledger. Do not suppress failures, omit expensive files or call a terminated run PASS.

A single general runner with printed dedicated exceptions is simpler than putting all fixtures in one role/state container. Putting every suite together risks wrong-role failures or accidental skips. A general suite metadata framework is unnecessary now; explicit case classification and a small dedicated ledger are sufficient. Avoid introducing parallel DB execution without proof of fixture isolation.

## Simulations

- New test/new root directory: classification exits1 immediately; no partial standard PASS can be mistaken for admitted coverage.
- New test inside attachment_gateway: automatically standard unless specifically deferred. Author must determine whether it needs gateway/migrator credentials before merge; a documented directory alone is insufficient environment evidence.
- API process runs migrator ACL fixture: deferral avoids contradictory session identity; dedicated migrator gate must still execute it rather than mark the omission complete.
- A standard file times out: failure recorded and later files continue until outer runner ends. An outer timeout yields incomplete coverage requiring continuation on the same source, not a successful final counter.
- Mailpit flag absent: dedicated gate must reject skip-only evidence; an ordinary zero exit is not protocol proof.

## Limits and decision

No confirmed defect in the53-line runner. Proceed with exact-source standard execution plus named dedicated gates. Do not describe old522-case evidence or new standard-only success as full backend completion. Excluded: run.py outer implementation, Compose environment, suite bodies/inherited fixtures, actual tracked inventory, role grants, test cleanup behavior and runtime durations. The report explains required environments and why separation exists; whole-project standards/performance/security acceptance is not inferred. Simulations supplied for root/Jules Obsidian recording; no vault mutation.
