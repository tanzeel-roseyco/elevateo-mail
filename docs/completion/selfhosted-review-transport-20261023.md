# Bounded production Mox transport review — 2026-10-23

Task `task_dc7426c6ac0b`, dispatch `ctx_460769c83cfd`; owner dispatch `ctx_6594097677c5`.
Static adversarial review only. **No runtime claim and no production-readiness approval.**

## Exact scope and provenance

Only these two implementation files were read, in full, including blank/comment lines:

| File under apps/server/lib/elevateo/send_worker/ | Physical LOC | SHA256 |
|---|---:|---|
| production_mox_profile.rb | 37 | c77c9e21ffe6d241ea56f838cd0d09d247a622a7ed89e83be947a8b830233294 |
| production_mox_transport.rb | 76 | 20ac6d1888db444a13e523fc04e50cdebca4f87ebd2a1d1c3c255170d8c916bf |

Total **113 physical LOC**, below the 200-line cap; the dispatched 39+80=119 count does not match the current source.
Hashes were rechecked before writing this report and remained unchanged. Concurrent changes after that check invalidate applicability to the changed file.

Context: project AGENTS.md and .planning/STANDARDS.md; project README/state/documentation context (large combined output was truncated); selfhosted-mail-20261023.md and selfhosted-initialize-20261023.md. No other implementation or test files were read. No nested reviewers, application execution, host tests, Docker work, dependency installation, credential inspection, cloud/DNS/mail calls, or commits occurred. This report is the sole modified file; coordinator owns code-reviews.md/global documentation integration.

## Purpose and checklist

| Area | Static assessment |
|---|---|
| Purpose / happy path | Separate production profile fixes port 587, validates configured host/domain/private-path shape, resolves a secret-backed SMTP binding, renders the immutable snapshot, compares tenant IDs, then submits through authenticated STARTTLS and returns a hashed acceptance receipt. Runtime success is unverified. |
| Null / empty / maximum inputs | Host/domain reject nonstrings, empty labels, labels over 63 bytes and total over 253 bytes; path requires absolute string length 2..4096 without NUL. Binding class and secret prefix are checked; password requires 1..4096 bytes without NUL/CR/LF. Epoch validity and snapshot validation delegate to unread helpers. Exact mailbox syntax, recipient/content bounds, nil binding fields and malformed resolver outputs depend on those contracts. |
| Failure before submission | Missing profile/binding, invalid credentials, tenant mismatch and credential unavailability hold the send. Invalid snapshot returns rejected. SMTP setup exceptions before the send call become redacted Held errors. Resolver exceptions other than MailCredentials::Unavailable deliberately propagate here; caller behavior is outside scope. |
| Failure during / after submission | started becomes true immediately before send_message; exceptions thereafter return unknown, as do non-2xx status or elapsed deadline. This conservatively avoids claiming definite failure when delivery may have occurred. Errors during SMTP shutdown can also produce unknown after acceptance; that is a safe ambiguity tradeoff, not a confirmed defect. |
| Authorization | ProductionMoxProfile type gate, MailCredentials::Binding type/secret prefix, configured sender-domain check and organization/mailbox equality are visible. SQL authorization of the exact credential tuple is asserted by a comment, not independently established by these files. Current capability/revocation, credential-account equality, outbound activation hold, and caller retry policy require separate review. |
| TLS / privacy | SSLContext requests peer and hostname verification; enable_starttls is used rather than opportunistic auto mode. Credentials are absent from receipt material and profile inspect is redacted. Actual pinned-library behavior, certificate rejection and logging behavior outside these files are unverified. |
| State / performance / maintainability | Profile values are copied/frozen; submission keeps local state and performs no visible database query. Code has small responsibilities, bounded hostname work and useful decision comments. No actionable duplicated abstraction or speculative feature found. Deadline wraps SMTP setup/send; credential resolution and rendering occur before it, so their boundedness requires an owner check. |
| Tests / docs / typing | Tests were excluded by assignment, so happy path, invalid profile/binding, TLS refusal, tenant mismatch, timeout, unknown/no-retry and acceptance regressions are NOT verified. RBS/Steep/lint evidence is NOT verified. Existing deployment documentation preserves activation gates; this review is not acceptance of those gates. |

## Actionable defects and density

**Zero confirmed actionable defects** in this bounded source. No severity/line defect entry is warranted without establishing the unread helper/caller contracts. This is not a claim that the transport or application has zero defects.

| Scope | Confirmed defects | Defects/KLOC |
|---|---:|---:|
| Profile, 37 LOC | 0 | 0.00 |
| Transport, 76 LOC | 0 | 0.00 |
| Combined unique 113 LOC | 0 | 0.00 |

Density uses confirmed defects / reviewed physical LOC * 1000. Open verification questions above are not counted as defects.

## Remaining evidence

Owner should establish resolver/snapshot validation and deadline contracts, SQL tuple authorization/revocation, no replay after unknown, strict type coverage, and isolated fleet fake-SMTP regressions including missing STARTTLS, bad certificate, auth failure, tenant mismatch and connection loss around DATA. Those checks must not contact real mail services. This assignment supplies no runtime, integration, visual, delivery, release or production activation evidence.
