# Self-hosted manifest validation — independent source review

Date: 2026-10-23. Task: task_96a6477ce47c / ctx_d089dee85697.

## Scope and evidence

Reviewed ONLY production source `ops/selfhosted-mail/validation.py`, every physical line 1–100, including blanks (100 unique physical LOC). The dispatched estimate of 108 lines does not match the file read. SHA256: `b9b394d54d99b6de5448de490717c24f4141501ba7d3e40da0025451e15628fe`.

Read supplied project instructions, `.planning/STANDARDS.md`, README/state/documentation checkpoints and the package README for requirements. No other production source or test bodies were reviewed. No tests, Python execution, builds, deployment, DNS queries, secrets access, nested agents or commits occurred. Reproductions below are source-derived proposed regression inputs, NOT executed results. Formatting is deferred to lint.

## Findings

### V1 — HIGH: global classification alone admits multicast as a host IPv4

Location: `ops/selfhosted-mail/validation.py:68–70`.

The only network suitability check is `IPv4Address(...).is_global`. Python's global-address classification does not mean assignable unicast host address; multicast addresses can satisfy it. Starting with an otherwise operator-approved valid manifest, substitute `public_ipv4 = "224.0.0.1"`. The branch does not explicitly exclude multicast and therefore does not establish the required real host IPv4 invariant. Any generated host/DNS configuration consuming that admitted value is unsuitable for a mail host. Confirm the exact Python 3.12+ behavior in fleet Docker before closing this finding; this review did not execute the reproduction.

Recommendation: require global unicast, explicitly rejecting `is_multicast` (and other non-host address classes as appropriate). Preserve independent operator evidence that the accepted unicast address is actually assigned; offline syntax checks cannot prove assignment.

### V2 — MEDIUM: reserved documentation domains pass public-domain admission

Location: `ops/selfhosted-mail/validation.py:40–48`.

The reserved-domain filter examines only the final label and misses reserved `example.com`, `example.net`, and `example.org` and their descendants. Source-derived reproduction: `fqdn("mail.example.com")` returns its input. A manifest with approved domain `example.com`, hostname `mail.example.com`, 120 distinct `u000@example.com` through `u119@example.com` accounts, an otherwise acceptable IPv4, a disjoint operator-supplied Workspace domain, quota 50, disk 40 and hold true passes the domain/capacity checks. The reserved address is an intentional negative fixture, not an invented deployment domain or DNS recommendation.

Recommendation: reject the reserved documentation domain roots and all their descendants in addition to reserved final labels. Require actual operator-approved names for positive runtime acceptance.

## Defect accounting

Two actionable source findings: 1 HIGH, 1 MEDIUM. Density: 2 / 100 * 1,000 = **20 defects/KLOC**, using all physical lines, not executable-line estimates. Counts do not imply runtime confirmation or whole-package review. Production admission is not approved by this review.

## Rubric coverage and limits

- Purpose/correctness: exact field set, strict lowercase labels, approved-domain membership and held outbound state are enforced. V1/V2 weaken the real host/public domain gate.
- Null/empty/max inputs: non-string names/accounts, empty domain lists, duplicate domains/accounts, counts other than 120, overlong names/localparts, extra/missing fields, Boolean capacities and out-of-range integers have explicit rejection paths. Null top-level JSON is rejected by `load`; direct misuse of the typed `validate` interface may raise TypeError rather than ValueError but does not admit a plan.
- State/data coupling: no network or persistent mutation occurs here. `cast(Plan, raw)` returns the caller's mutable dictionary; callers must not mutate it after validation. Caller ownership and downstream materialization were out of scope, so no demonstrated defect is counted for aliasing.
- Workspace safety: exact overlaps with hosted domains and exact hostname equality are rejected. Explicit approved child domains remain allowed by the anchor comment. Completeness of the operator's Workspace inventory, DNS generation, and preservation of live Workspace routing cannot be established in this file.
- Identity correctness: 120 unique full lowercase address strings are required; all supplied domains must be used. Matching those strings to the authorized source inventory/person identities belongs to an upstream boundary and is not proved here.
- Capacity: exact integers, bounded quotas/disk and deterministic 15% overhead plus 10 GiB reserve within 80% declared disk are checked. Actual host free space, inodes and assigned IP remain operator/runtime evidence requirements documented in the package README.
- Design/simplicity/naming: small single-purpose helpers, bounded account/domain lists, no database loops, no added dependencies or speculative abstractions. Membership checks are bounded at 120 domains/accounts; no material bottleneck found. No justified duplicated logic requiring extraction within this file.
- Comments/documentation: the AIDEV anchor explains the deliberate child-domain allowance. README clearly separates offline validation from ownership, activation and physical capacity verification. No documentation edits outside this report are authorized.
- Input/security/authorization: duplicate JSON keys rejected recursively, exact manifest keys enforced, address localparts constrained and outbound hold requires literal true. No secrets or logging in the assigned file. This module checks supplied approvals, not authenticated operator authorization or DNS ownership; do not infer those guarantees.
- Tests: test filenames were observed but their bodies are outside the assigned review. Existing happy-path/failure coverage is therefore NOT VERIFIED; no tests were run and no historical results are adopted.

## Required fleet-only regression coverage

1. Valid operator-owned unicast host and authorized exact 120-account inventory, plus multicast and private/documentation IPv4 rejection.
2. Reserved example-domain roots/descendants rejected; real approved child domains accepted without Workspace apex overlap.
3. Counts 0/119/120/121, duplicate and uppercase identities, 64/65-character localparts, missing/unused/unknown domains, null and non-string elements.
4. Nested duplicate JSON keys, top-level null/array, 128 KiB boundary, unknown/missing fields and literal-true hold enforcement.
5. Exact capacity threshold and one-unit failure, Boolean/float/null capacity rejection; separately prove actual assigned host IP and disk availability before activation.

These are coverage requirements, not claims that existing tests are absent or that runtime behavior has passed. Other reviewers/coordinator own package-wide design, tests and activation acceptance.
