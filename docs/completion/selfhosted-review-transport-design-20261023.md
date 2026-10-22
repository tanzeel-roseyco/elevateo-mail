# Application transport design review — 2026-10-23

Task `task_8a593532c3ae`, dispatch `ctx_57dd643ec7ed`; implementation owner `ctx_6594097677c5`.
Source-only bounded adversarial review using the complete supplied rubric. No source edits, tests,
imports inspected, nested workers, secrets, cloud/DNS access, commits or activation.
Requested model/billing profile is not independently verified by this review.

## Exact coverage

Paths verified with `rg --files`. Each complete file is a separate packet below 200 physical lines.
Blank lines and comments count; 198 unique physical lines total, including 49 test lines.

| File under apps/server | Inclusive range | LOC | Whole-file SHA256 |
| --- | --- | ---: | --- |
| lib/elevateo/send_worker/production_mox_profile.rb | 1–55 | 55 | `0ae1c9aed2799c9ddeb988abd7b76748dba0ff676dd2d70a0ded3b1812a7c513` |
| lib/elevateo/send_worker/production_mox_transport.rb | 1–76 | 76 | `805d6e560d2ca345d78d6bd82a546ea638157ca8a022376c704f063a97eef91b` |
| db/migrate/20261023000042_allow_verified_enrollment_lock.rb | 1–18 | 18 | `82e7c115e8714145b1e59c20f22c75864559e38b09afcc2d61c58fa95030277a` |
| test/administration/verified_enrollment_database_test.rb | 1–49 | 49 | `61160f036469cdc5441e645bbd460cc5dae743fc4834d18168e83d2d6a1001c2` |

Read AGENTS.md and .planning/STANDARDS.md plus current README/state/documentation sections and
the transport owner report. Large combined documentation output was truncated; current sections
were subsequently read separately. No claim of exhaustive historical documentation review.

## Findings and accounting

Zero confirmed implementation defects / 198 reviewed physical LOC = **0 defects/KLOC**.
One LOW documentation defect, tracked separately: **DESIGN-DOC-01**.
An inclusive issue-count normalization is 1 / 198 × 1000 = **5.05 issues/KLOC**;
the numerator includes a documentation issue outside the implementation denominator.
These densities are bounded review bookkeeping, not whole-application quality estimates.

**DESIGN-DOC-01 — stale production configuration interface.**
`docs/completion/selfhosted-transport-20261023.md`, Configuration interface, still instructs
`ELEVATEO_MOX_FROM_DOMAIN` and describes one exact sender domain. Current profile lines 14–25
instead require `ELEVATEO_MOX_VERIFIED_DOMAINS`, a JSON array of 1–120 distinct validated domains.
Following the documented interface yields `verified Mox domains required` before transport starts.
Update the setup instructions, sample shape and single-domain wording to the multi-domain interface;
retain separate SQL domain-authority provisioning. This fails closed, so severity is LOW operational
documentation correctness, with no demonstrated authorization bypass. Reported immediately to the
coordinator and implementation owner as `msg_7f17468fa087` and `msg_d5d1329b3c42`.

## Failure simulations and design tradeoffs

The following are explicit local reasoning simulations, not executed tests. Obsidian integration
was unavailable; nothing was simulated through a connected vault and no vault update is claimed.

| Simulated failure | Expected behavior from inspected source | Tradeoff and recommendation |
| --- | --- | --- |
| Domains absent, JSON null/object/empty list, duplicate, 121 elements, >32768 bytes, invalid hostname | Configuration rejects before SMTP; validated domain strings/list are frozen | Bounded startup validation is simple and fail closed. Keep SQL authorization separate from this process-wide allowlist. |
| Host is `mail.a.company.tld`, domains include `a.company.tld` and another tenant domain | Host suffix requirement passes; sender must match an exact listed domain | Shared transport can serve multiple domains without copying workers. List membership proves configuration permission only, not ownership or tenant permission. |
| Tenant A binding paired with tenant B rendered snapshot | Organization/mailbox mismatch raises Held before deliver | Explicit coupling protects this seam. Resolver must enforce account/version/reference/protocol identity; its implementation is outside scope. |
| Stale account version or an enabled process domain whose SQL domain authority is disabled | Cannot determine from these four files | SQL final authorization and Bundle binding remain mandatory independent enforcement. Do not treat this source review as proof of either or expand process allowlist into SQL authority. |
| Missing STARTTLS or untrusted/wrong-host certificate | Mandatory STARTTLS/context peer and hostname verification should fail before submission | Availability is sacrificed to prevent credential exposure. Actual Net::SMTP/OpenSSL integration and certificate behavior require runtime evidence. No opportunistic fallback appears here. |
| Failure at authentication or deadline check before send_message | Held with redacted error and no accepted receipt | Safe retry before submission is preferable to an unnecessary unknown hold; downstream retry semantics are outside scope. |
| Disconnect, 450/550, timeout, or QUIT failure after send_message starts | Unknown; started is deliberately set before the whole send_message call | Conservative at-most-once submission policy can hold even a known MAIL/RCPT rejection. Accept the operational cost to avoid duplicate messages; narrow phases only with explicit protocol evidence and regression tests. |
| SMTP returns 2xx, then deadline expires before classification | Unknown rather than accepted | Prevents overstating timely completion. Operator reconciliation is needed; observation returns nil and transport exposes no replay path. Durable persistence/no-autoreplay live in unreviewed downstream code. |
| Runtime API login forges app.org_id and invokes enrollment | Assigned negative test expects InsufficientPrivilege and no organization_access rows | New policies require both owner effective role and original migrator session identity. Forged org context cannot satisfy session_user. Test coverage is present but unexecuted. |
| Migrator reaches SECURITY DEFINER owner while forced RLS applies | SELECT and UPDATE policies admit organization rows for original migrator login | Correctly addresses row-lock policy needs without runtime-role RLS access. It intentionally gives trusted migrator broad organization access while owner-effective; scoped function ACLs, SQL predicate, owner-role membership and function body are outside this packet. |
| Invalid enrollment user, or rollback migration | Test expects FK error/no receipt; down removes both policies | Transaction behavior and reversible policy teardown are coherent in source. Runtime test and migration rollback evidence must come from owner. |

No database transaction is introduced around network I/O in this packet. SMTP credentials are
per-call locals, not cached across tenants; shared profile contains only immutable configuration.
The trusted migrator is an administrative trust boundary, not a tenant principal. The policy itself
does not restrict a particular SECURITY DEFINER function: that restriction must come from existing
role/function grants and validated function predicates, which were deliberately not inspected.

## Mandatory rubric checklist

- Purpose/state correctness: profile and transport responsibilities are separated; tenant snapshot
  guard precedes deliver; migration adds only required policies. Durable state and final SQL gates unverified.
- Null/empty/max inputs: inspected config bounds, nil binding handling, password bounds and missing MIME.
  Sender syntax and snapshot parsing are delegated to unreviewed Bundle/SmtpSnapshot; no independent validation claim.
- Simplicity/single responsibility/duplication: no new abstraction recommended; short profile, transport and
  reversible migration remain focused. Imported fixture duplication cannot be assessed within scope.
- Naming/comments/complexity: intent-bearing names and AIDEV decision comments explain isolation, TLS,
  uncertainty and RLS. No deeply nested hot loop; bounded domain scan is at most 120 entries.
- Tests: assigned test covers verified happy path, invalid membership/no receipt, and runtime denial.
  Its helper/import and transport tests were not inspected or executed; no complete regression-coverage claim.
- Documentation: current source diverges from owner configuration instructions, recorded as DESIGN-DOC-01.
- Security: checked boundary validation, immutable config, credential redaction, tenant guard, mandatory TLS,
  and original-session RLS identity. Resolver validation, SQL authority, grants and provider internals remain out of scope.
- Performance: per-send SSL context and linear <=120 domain lookup trade small overhead for isolation/simple
  behavior; no repeated database queries or unbounded loop introduced by the assigned transport code.
- Standards: deliberate unknown outcomes and real-role regression intent align with written standards;
  separate signatures/types, actual forced-RLS behavior and deployed TLS cannot be certified from these files.
- Formatting delegated to owner lint/CI. No lint or runtime PASS inferred from source inspection or historical results.

## Acceptance limit

Bounded design review complete with one LOW documentation correction requested. This is not a release,
whole-project security approval, SQL authority approval, or durable unknown/no-replay runtime acceptance.
Coordinator owns central code-reviews.md integration; only this assigned report was written.
