# Bounded final protocol / key admission review — 2026-10-23

Task `task_6ad7d188e9e6`, dispatch `ctx_a18b76842f68`. Read-only source review; only this report was written. No tests, source edits, imported implementation/test reads, secrets, cloud/DNS access, nested workers or commits.

## Scope and exact source

| Packet | File / physical range | Lines | SHA-256 (whole file) |
| --- | --- | ---: | --- |
| 1 | `ops/selfhosted-mail/runtime_protocol.py:1-140` | 140 | `f24313431c5b99d849a94a7561f4f74b4d5b8eb1b58f3c5ecb3b007340c77513` |
| 2 | `ops/selfhosted-mail/keys.py:1-32` (full) | 32 | `27468864763e312ee3cd6a7e4ecc7b1ced2292dce725f35a24696aa988dcad5c` |
| 2 | `ops/selfhosted-mail/tls_preflight.py:1-76` (full) | 76 | `776fb8aaa1b4fb3ce528fe89b12bebfbb46b780fa9a62062bf15445170c717d8` |

Packet 2 totals 108 physical lines; total unique reviewed source is 248 lines, including blanks/comments. Hashes were checked again before writing and remained identical. Guidance/context: AGENTS.md, .planning/STANDARDS.md, README/state/documentation current entries, and docs/completion/selfhosted-production-20261023-handoff.md. No previous review reports were repeated or imported.

## Actionable finding

**R1 — HIGH — real IMAP APPEND fails before isolation acceptance (`runtime_protocol.py:120-121`).** `client.append('Inbox', message=...)` omits required `flags` and `date_time` parameters. The Python API is `IMAP4.append(mailbox, flags, date_time, message)`; accepting `None` is different from providing a Python default. The real client raises `TypeError` before sending APPEND, so `exercise()` cannot complete owned sentinel verification, remaining mailbox isolation, or certificate-negative checks and cannot return its checks list. Any downstream restart/restore gate requiring this exercise to finish is blocked. Line 120's comment incorrectly claims native defaults exist.

Repair recommendation: explicitly pass `flags=None, date_time=None`, preserving native unflagged/current-date semantics, and update the comment in the same change. Add a regression whose fake follows the actual required signature, plus fleet Docker execution against real IMAP; do not weaken the production invocation to accommodate a permissive stub. Official signature evidence: [Python imaplib API](https://docs.python.org/3/library/imaplib.html#imaplib.IMAP4.append). This is a static finding, not a claimed runtime reproduction.

Sent immediately to coordinator and implementation owner `ctx_07b8e333216d`: receipts `msg_6272041afb6b` and `msg_1e64ad23c006`.

## Rubric checklist and observations

- Purpose/protocol: SMTP 587 STARTTLS and IMAP 993 use verified contexts and explicit timeouts. UID SEARCH calls use `SUBJECT token` without a charset argument, appropriate to UID SEARCH; fixed internal tokens need no quoting here. SMTP-to-B verification explicitly chooses index 1 while the generic helper defaults to index 0. APPEND is blocked by R1.
- Empty/null/max inputs: empty UID result fails the one-message assertion; duplicate matches also fail closed. Malformed credential JSON and unexpected IMAP response shapes propagate errors rather than producing PASS. Credentials and tokens are fixture-controlled, not public input. File admission rejects empty/oversized, nonregular, multiply linked and broadly accessible files; default bound is 131072 bytes.
- State/coupling/isolation: owned sentinels, missing unknown delivery, A's inability to read B's sentinel or SMTP message, and B mailbox selection denial are explicit assertions. Incorrect B password rejection is covered. Actual fixture provisioning, credential uniqueness and external network isolation belong to unreviewed callers; no independent guarantee is inferred here.
- Restored receipts: `verify_message()` requires exactly one matching UID and a fetched body containing the token. This helper alone does not establish restoration, backup completeness, restore-root separation, exact restored message count or caller selection of account B. Those caller conditions are outside assigned source and remain unverified by this review.
- TLS/key boundaries: root canonicality/private ancestry, interior symlink rejection, owner/mode/size/link checks precede TLS reads. Trust, hostname, server purpose, expiry horizon, key integrity and certificate/key public-key match are explicitly checked. DKIM generation validates OpenSSL output before delegated exclusive publication. Imported validation/publication implementations are not reviewed; their contracts are dependencies, not independently proven facts.
- Design/maintainability: small helpers, deliberate cleanup/rethrow and bounded subprocess/network operations. No actionable duplication, excessive abstraction or hot-path database/query concern in these packets. `exercise()` combines related fixture assertions; splitting it is not necessary for correctness. Critical comments mostly explain intent; R1 identifies the incorrect comment. Formatting is left to linters.
- Tests/documentation: protocol source includes positive and several negative acceptance assertions; separate unit/integration tests were not assigned and were not read or executed. Coverage of key/TLS failure branches and the append regression cannot be confirmed. Current handoff explicitly limits evidence to isolated runtime and keeps production activation gated; historical PASS statements do not accept these hashes.

## Counts and limits

One actionable defect (HIGH); overall density **1 / 248 × 1000 = 4.03 defects/KLOC**. Packet 1: 1/140 = 7.14/KLOC; packet 2: 0/108 = 0/KLOC. No additional actionable TLS/key defect found in assigned source. No design-tradeoff change or Obsidian simulation was performed; only a minimal API-correctness repair is recommended.

Disposition: bounded review complete, source not accepted pending R1 repair and exact-source fleet verification. No runtime, whole-project, restore, production or release acceptance claimed. Coordinator owns central review/state integration and any separately assigned design review.

## Source-change pause at completion

Immediately before settlement, owner message `msg_873ffa903ba2` reported an APPEND repair. A hash-only check confirmed `runtime_protocol.py` changed to `0214b1d54baf1d3ce7c48d9d7cd6d7ba7f3a36f87f570e435ba672e9449262e4`; keys/TLS hashes remained unchanged. Per dispatch instructions, review paused without reading the changed source. The finding/density above belong exclusively to the reviewed original hash; the reported repair is NOT independently accepted. A fresh bounded assignment and fleet verification are needed for the changed final source. Final-source review outcome is incomplete because the source changed, rather than a claim that the reported repair failed.
