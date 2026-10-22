# Bounded runtime/provisioning adversarial review — 2026-10-23

Task `task_924d4508cfb2`, dispatch `ctx_1a21fae88e6c`. Static source review only; no tests, builds, secrets, cloud, DNS changes, nested workers or source edits. Read AGENTS.md, .planning/STANDARDS.md and README/state/documentation context. Requested model/billing identity is not independently verified.

## Exact coverage

Paths below are relative to `ops/selfhosted-mail/`; ranges include every physical line, including comments/blanks. No imported implementations or separate tests were read.

| Packet | File/range | LOC | SHA-256 |
| --- | --- | ---: | --- |
| A1 | runtime_dns.py:1-63 | 63 | e0cd32ac0896d480e1d27d1334cda48868fe86cb530ef8c055ad53b53632cd54 |
| A2 | runtime_protocol.py:1-140 | 140 | 9bec5867251676ec7671dea3c4edd0efa6612ebcb75df28e90986c0eb8940b8a |
| B | provision.py:1-51 | 51 | 1c0dd315e399d6562c8fce75fbad89dc63b9c255b87fcd96fb8488d4a7a69336 |
| B | private_publish.py:1-20 | 20 | 519c5f5b630e94fb835c0d44b1920fa36747eeb2644f602841eabb24adb7cfdb |
| B | runtime_acceptance.py:1-82 | 82 | 6e01dce49cf6d54a9ca8aaf1b897b992e9657e5207f89b69a83aff1f7317bda4 |

A1=63, A2=140, B=153; each packet <=200. Total=356 unique source LOC, no omitted assigned ranges. One MEDIUM defect: **2.81 defects/KLOC** overall (1/356*1000); protocol packet density 7.14/KLOC. Overlapping review totals elsewhere must not be added to this denominator.

## Actionable finding

**RUNTIME-OPT-1 — MEDIUM: optimized Python removes operations and verification, leaving success claims.** `runtime_protocol.py:50-54,64-98,120-131` puts side-effecting SMTP MAIL/RCPT/DATA and IMAP SELECT/APPEND calls, plus delivery/isolation oracles, inside `assert`. Python `-O`/`PYTHONOPTIMIZE` removes these statements entirely. Success labels at lines99/109/126/132 remain unconditional; `runtime_acceptance.py:65` can consequently publish passed=true after weakened checks. For example, a prepopulated mailbox can supply search/fetch results without any new SMTP DATA submission, and restore verification no longer validates returned status/body. This invalidates evidence semantics under optimization, even though the binary pin itself is correctly implemented with explicit if/raise.

Reject optimized execution at the entrypoint before starting services, or evaluate operations unconditionally and enforce results with explicit exceptions. Add a fleet-container negative regression proving optimized execution cannot publish successful acceptance after skipping the SMTP/delivery oracles. No failing execution was performed here; this is established from Python assert semantics and the inspected source. Finding sent immediately to coordinator and implementation owner dispatch ctx_07b8e333216d.

## Requested invariants and boundaries

- **Real SMTP-to-IMAP delivery:** normal, unoptimized source submits A-to-B through authenticated STARTTLS SMTP587 DATA, then polls B's verified-TLS IMAP for one matching subject and fetched token. It separately checks A cannot see the message. This is substantially stronger than IMAP APPEND alone. Runtime execution, fresh fixture state and actual queue behavior remain unverified; the token is fixed, so freshness depends on configure() creating clean state outside this review.
- **No external network:** DNS binds only 127.0.0.1:53, never forwards, and returns loopback A/fixed MX records for two explicit fixture names. This establishes fixture behavior only. HOST resolution, Mox configuration and Docker network isolation are imported/unassigned. The report's literal network=none does not itself prove isolation; fleet runner/namespace evidence is required.
- **Unknown recipient rejection:** lines68-74 handle acceptance at RCPT by checking the final DATA response for permanent rejection; an earlier permanent RCPT rejection also passes. Subsequent normal-mode checks search both owned Inboxes for the sentinel and reject an unknown-account directory. Source supports the intended delayed-DATA case but does not force the server to defer rejection to DATA; runtime receipts must say which path occurred. Both assertions and some operations disappear under optimization.
- **Pinned binary under -O:** runtime_acceptance.py:17-21 uses explicit digest comparison/ValueError, so optimization cannot erase the check; verify_binary runs before version/configure/start. The upstream provenance of the literal digest and binary file race/permissions are outside scope.
- **Private directories/files:** provision() calls private_root and private_file before mutations; these helpers were not inspected. The inspected leaf check uses O_NOFOLLOW/O_NONBLOCK, fstat regular-file/mode0600/owner/single-link/size checks, strict credential keys, identity matching, bounded URL-safe passwords and all-file prevalidation before docker mutation. Parent-directory validation and manifest/account cardinality depend on the imported validators and are not independently established. No secrets enter argv or reported subprocess output. Partial subprocess failure is deliberate held-state/retry behavior, not an atomic 120-account transaction.
- **Atomic complete Bundle publication:** publish() writes a private same-directory temporary file, flushes/fsyncs it, uses exclusive hard-link publication, unlinks the temporary name through its context manager and fsyncs the parent. Existing targets are not replaced; successful readers see complete supplied bytes. Bundle structural/completeness validation and trusted parent admission belong to callers outside scope. Directory fsync failure can occur after visibility, so callers must treat raised errors as uncertain publication rather than guaranteed absence. No independent defect claimed without caller contract evidence.

## Mandatory rubric checklist

| Area | Static disposition |
| --- | --- |
| Purpose/behavior correctness | Checked SMTP/IMAP, pin, provisioning and publication flows; RUNTIME-OPT-1 open. |
| Null, empty, maximum inputs | DNS truncation/label bounds and credential shape/length checked; empty manifest/cardinality deferred to uninspected validation. Public helpers have typed contracts; no external API claimed. |
| State/data coupling | All credentials admitted before mutations; retries reuse inputs; snapshot copied for restore; exact ROOT/HOST coupling remains imported. |
| Simplicity, responsibilities, duplication, naming | Small concern-specific helpers; no additional actionable issue found in 356 LOC. |
| Comments and nesting | AIDEV notes explain isolation, mutation ordering and publication; no substantive nesting defect identified. Formatting excluded. |
| Happy/failure tests | Assigned harness contains relay/auth/sender isolation, TLS chain/name, unknown recipient, persistence and restore probes. Separate unit/regression tests excluded by assignment; their presence/coverage and execution are not verified. |
| Documentation | Context records incomplete activation and scoped evidence; this report records exact static limits. No application documentation completeness claim. |
| Input/security/authorization | Credential boundary checks and SMTP/IMAP identity checks inspected; imported private-path and fixture network/config security remain unverified. |
| Performance/bottlenecks | Protocol socket timeouts, bounded polling and provisioning subprocess timeout present. Binary read_bytes loads entire pinned executable; no demonstrated bottleneck. No DB-query hot path in scope. |

## Coordinator-authorized repair rereview

Before settlement the coordinator requested rereview of the owner's exact small repair. Runtime acceptance is now 86 physical lines, SHA-256 `8e2b35de35d013aba44d98a39700c3b6ef8cf22da06a4103fce8495aea0580f0`. Inspected repair/context ranges: lines9-11,24-30 (10 physical lines). `test_runtime.py` SHA-256 `5f186c88620c51a731bfe1037bc4769a8f9a006a505a064af878aaec299f4b4f`, inspected only lines12-17 (6 physical lines), not the rest of this test file or its imports.

The entrypoint explicitly raises RuntimeError when sys.flags.optimize is nonzero, before constructing the report or DNS fixture and before configure/start. This closes RUNTIME-OPT-1 **at source level for the intended acceptance entrypoint**. The added subprocess regression requests -O, requires nonzero exit and checks the specific rejection diagnostic; source is consistent with the intended regression. Tests were not run by this reviewer, and no separate regression execution is claimed. Imported module side effects remain outside the reviewed contract; direct use of exercise() remains assertion-dependent.

Conservative cumulative coverage charging all reread context again is 372 physical LOC (356+10+6), below400; actual unique coverage is lower because context overlaps the baseline. Original density remains1/356=2.81/KLOC; conservative cumulative historical density1/372=2.69/KLOC. Final new defects0, remaining confirmed source defects0 (0/KLOC); the original MEDIUM is retained as repaired history. The full-file hash identifies the repair version, not a claim that uninspected successor lines were reread.

No actual-runtime PASS, network-isolation PASS, production acceptance or release authority is established by this review. Coordinator owns independent fleet evidence and review-ledger integration; only this assigned report was written.
