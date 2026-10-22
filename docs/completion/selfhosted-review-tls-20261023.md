# Bounded adversarial TLS and DKIM review — 2026-10-23

Task task_1476947f9494 / dispatch ctx_bdd4d122cae5. Static review only; no runtime claim.

## Scope and exact source

Read project AGENTS.md and .planning/STANDARDS.md; README.md, state.md, documentation.md, ops/selfhosted-mail/README.md and completion documentation supplied context. Only the following implementation files were read. Physical LOC includes blank lines and comments; the combined 107 lines are below both the dispatched 120-line estimate and 200-line ceiling.

| File | Reviewed lines / physical LOC | SHA256 |
|---|---:|---|
| ops/selfhosted-mail/keys.py | 1–32 / 32 | 8aa7ec77d48ca81077c3dc73485c8e50f5f53333702dc0a9f595d9d3b36f5eb5 |
| ops/selfhosted-mail/tls_preflight.py | 1–75 / 75 | c905606d51f2a3c48d757a0993b8974475b85b27cfeef074a2ad714679ada500 |

Hashes matched on a second read immediately before report creation. Other workers may subsequently change these files; this review applies only to these bytes. Historical completion documentation lists an older keys.py hash and does not prove current-source runtime behavior.

## Purpose, happy path, failure and authorization checklist

| Area | Static assessment and limits |
|---|---|
| Purpose | keys.py creates exclusive RSA-2048 DKIM keys for validated domains; tls_preflight.py admits private filesystem inputs and verifies operator-supplied TLS. No mail transport or network command appears in these files. |
| Happy path | Canonical private root, bounded private manifest, private DKIM directory and unused per-domain targets lead to bounded OpenSSL generation. TLS checks validate chain/server purpose/hostname, 14-day validity and public-key equality. Actual OpenSSL/Mox compatibility was not executed. |
| Missing/empty/oversized input | private_file rejects absent files through deliberate propagated filesystem errors, zero bytes, files above 131072 bytes, nonregular files, multiple hardlinks and insecure modes/ownership. Manifest structure, nulls, empty domain lists and domain maxima depend on imported validation, intentionally not read. |
| Failure handling | Root/symlink/permission failures reject admission. Existing key targets fail O_EXCL. OpenSSL verification failure rejects TLS; generation errors and subprocess timeouts propagate. CLI arity is checked. Missing executable also propagates. |
| Authorization | Filesystem ownership/modes, canonical roots, checkout exclusion and trusted ancestors enforce an operator boundary. Commands use argv arrays rather than shell evaluation; secrets are not printed by these files. Actual domain ownership remains an operator prerequisite, explicitly documented rather than inferred from syntax. |
| State and coupling | No overwrite of existing DKIM keys; imports couple manifest schema to validation. TLS reads are nondestructive. Checks assume operator-controlled Linux filesystem state; concurrent trusted-operator mutation is not made atomic. |
| Complexity/performance | Small single-purpose functions; bounded subprocess deadlines; per-domain generation is necessarily sequential. Maximum domain count is outside reviewed scope. No database queries or needless architectural layer appears. |
| Comments/documentation | AIDEV notes explain nonoverwrite, ancestor and TLS trust decisions. Linux/OpenSSL prerequisites and operator activation/renewal/recovery boundaries are documented. Formatting was not reviewed. |
| Tests | No test implementation read or run, as required. Existing completion notes describe earlier fleet tests but do not establish coverage of these hashes. Require fleet evidence for valid chain/key, untrusted/expired/wrong-host/mismatched-key TLS, symlink/insecure-file admission and failed key generation. Unit/integration completeness remains unverified. |

## Findings and density

Confirmed actionable defects: **0**. Defect density: **0 / 107 × 1000 = 0.00 defects/KLOC**. Per-file: keys.py 0/32 = 0.00/KLOC; tls_preflight.py 0/75 = 0.00/KLOC. This is a bounded source finding, not whole-project approval.

An initial MEDIUM candidate sent to the coordinator and owner was withdrawn after reading the operational runbook: keys.py:21–26 creates the final exclusive file before OpenSSL succeeds, so a missing executable, timeout or nonzero exit can leave an empty/partial PEM and prevent retry. The README explicitly requires inspection after partial failures and prohibits rerun over live state; therefore this is a documented recovery limitation rather than a confirmed violation. Both recipients received the correction before completion. Do not automatically delete existing keys to enable retries. Optional future recovery improvements must preserve exclusive publication and valid earlier-domain keys, and need separately reviewed failure regressions.

## Limits and authority

No implementation edits, commits, nested agents, host tests, Docker jobs, cloud/DNS/mail calls or deployment actions were performed. Only this report was written. Validation internals, consumers, test code, live permissions, trust-store configuration, certificate renewal and running mail behavior were outside scope. No runtime, production-readiness, live-delivery or full-test-coverage claim is made. Central code-reviews.md remains coordinator-owned under the write-only-this-report restriction.
