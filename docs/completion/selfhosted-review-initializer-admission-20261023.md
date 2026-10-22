# Initializer admission adversarial review — 2026-10-23

Read-only source review; no implementation changes, execution, production connection, nested workers, or commits. Only this report was written. AGENTS.md and .planning/STANDARDS.md supplied the engineering/security rubric; formatting is delegated to linters. Requested reviewer billing/model identity is not independently verified.

## Exact coverage

Counts and SHA-256 values were captured before review, including blank/comment lines:

| File | Covered range | Physical LOC | SHA-256 |
| --- | --- | ---: | --- |
| ops/production/initialize/admission.py | 1–80 (entire file) | 80 | d9904b102a9c27e6f3be3c0837a600cdd2634fa5487f108698b74d1f31e6eb29 |
| ops/production/initialize/tenant.sql | 1–88 (entire file) | 88 | f338ce20388a24bc07aa92192bed5bd91be190004e2913a0670600c4831f1c32 |

Total reviewed implementation: **168 physical LOC**, below the 200-line cap. Context only: initializer README; generation-lock function and access/receipt schema excerpts in apps/server/db/be02/generations.sql and apps/server/db/sec802/access.sql. Test names/search matches were inspected to identify evidence gaps; tests and schema context are not additional reviewed implementation or claimed review coverage.

## Findings

### HIGH — F1: checkout ancestor names can eliminate the entire approval source digest

Location: admission.py:29–39, especially line 36; acceptance at line 68.

The exclusion checks `path.parts`, which contains absolute checkout ancestors, rather than only the path relative to `root`. For a valid absolute checkout root `/tmp/checkout`, every candidate contains the component `tmp`, so every candidate is skipped. `source_digest` consequently returns SHA-256 of empty bytes (`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`), regardless of changes to server code, DDL, or the initializer. The same issue occurs beneath ancestors named `log`, `.bundle`, or `__pycache__`, including on Windows. The README expressly permits any absolute root.

Static reproduction recipe (not executed): place a complete checkout beneath `/tmp/checkout`, obtain its source digest, change a server or SQL file, and obtain the digest again. Both values are the empty digest; an existing gate's source comparison still passes. Other gate attestations do not restore the missing source binding. This is a location-dependent approval integrity failure, not a claim that all gates are forgeable.

Recommendation: apply exclusions to root-relative components only, and fail closed when required source roots/files are missing or the reviewed file set is unexpectedly empty. Regression coverage should demonstrate digest sensitivity beneath excluded-name ancestors and rejection of an incomplete checkout.

### MEDIUM — F2: symlinked source directory escapes the protected checkout boundary

Location: admission.py:31–38.

The explicit symlink rejection checks only each enumerated leaf. A symlink at an enumeration starting directory, for example `apps/server -> /outside/server`, is followed when that directory is used as the `rglob` starting point. Regular files beneath it satisfy `is_file()` and are not themselves symlinks, so their bytes are accepted under lexical repository-relative names. No resolved containment or ancestor check rejects this arrangement. The analogous explicitly globbed initializer directory has the same boundary issue.

Static reproduction recipe (not executed): replace the starting server directory with a symlink to an external directory containing regular source files, then call source_digest. The leaf-only rejection does not reject the directory link. A read-only repository mount does not by itself protect that external target; separately mutable targets also undermine the documented source immutability assumption. This does not imply a digest collision: the issue is acceptance of source outside the intended protected boundary.

Recommendation: reject symlink ancestors within the source tree, verify resolved files remain under the approved resolved root, and document/enforce the root mount boundary. Add a containerized regression for a symlinked starting directory as well as a symlinked leaf. Immutable mounts remain necessary to address concurrent replacement after validation.

## Other reviewed behavior and limits

- Backup admission requires an object, exact target/phase/source/tenant values, literal true attestations, bounded gate size, nonempty regular evidence artifacts, and exact evidence digests. It does not establish backup usability, approval authenticity, or live server identity; the README correctly assigns those facts to protected operator acceptance. Gate/evidence symlinks are not rejected, but external read-only protected evidence is explicitly the operating contract, so no separate defect is counted solely for that omission. Stat/read races remain dependent on that immutability contract.
- Tenant parsing enforces canonical nonzero UUIDs, bounded names, role enum, and receipt syntax. Missing/invalid typed CLI values fail rather than silently becoming enrollment authority. Arbitrary runtime values outside Mapping[str,str] can raise TypeError/AttributeError; caller exception handling is outside this packet, so no system-level defect is asserted.
- SQL uses psql literal quoting, one transaction, timeouts, administrator identity checks, expected ownership and forced-RLS checks, and restricted role attributes. It checks an existing confirmed, active Auth UUID plus Google identity without email lookup or creating Auth identities. Auth row locks cover deletion/ban updates and identity locks cover concurrent identity removal through commit.
- The shared advisory lock serializes participating initializers, including initial-owner races. Generation and organization locks align with the consulted schema context. The unique owner index supplements the explicit owner-order check. Exact existing membership/access/receipt/name matches support retries; conflicts raise and roll back. This is static reasoning, not proof against every external writer or real Supabase role configuration.
- No additional concrete tenant.sql defect was identified. No unneeded abstraction, duplicate helper extraction, hot-loop query bottleneck, or deep conditional rewrite is recommended for this bounded operator tool. A global initializer lock trades throughput for simple serialization; reasonable for infrequent stopped-writer initialization, with a bounded contention failure rather than a performance guarantee.
- Existing test names indicate admission happy/invalid paths, backup tampering, tenant retry/forced RLS, unknown and unconfirmed users, and conflicting/unreceipted membership. No test suite was executed or comprehensively reviewed. Search evidence did not establish ancestor-directory, symlink-directory, real Google Auth, concurrent initializer, or restore-based coverage. The README explicitly limits its fixture SQL tests and leaves isolated restore acceptance open.

## Accounting and disposition

**2 defects: 1 HIGH, 1 MEDIUM. Density: 2 / 168 × 1000 = 11.90 defects/KLOC.** Admission subset: 25.00 defects/KLOC (2/80); tenant subset: 0/88 identified, not a correctness certification. Static review only; no host tests, Docker tests, builds, live operations, or visual acceptance were performed. Remediation, independent re-review, and fleet Docker regressions remain necessary before this review can support admission acceptance. No production release approval is implied.

Findings were immediately enqueued to the coordinator and implementation dispatch ctx_0fe40c783604. F1 receipts: msg_0af96e5fd4a5 / msg_f3ec00c7c2e1. F2 receipts: msg_407e43c97308 / msg_e5c4bda99fa2. Durable enqueue is not proof the recipients read or accepted them.
