# Final protocol repair review — 2026-10-23

Task `task_d75defd240ac`; dispatch `ctx_41a3b427f4ab`. Bounded adversarial source review only; this report is the sole edit. No tests, application execution, imported project source/test reads, secrets, cloud/DNS access, nested workers or commits.

## Scope and provenance

One packet: `ops/selfhosted-mail/runtime_protocol.py`, physical lines **1–141**, full file including blanks/comments; **141 unique source LOC**. Final accepted SHA-256: `0214b1d54baf1d3ce7c48d9d7cd6d7ba7f3a36f87f570e435ba672e9449262e4`.

Read AGENTS.md, .planning/STANDARDS.md, current README/state/documentation context and the prior bounded protocol report. Prior report records original hash `f24313431c5b99d849a94a7561f4f74b4d5b8eb1b58f3c5ecb3b007340c77513` (140 LOC), one HIGH missing-required-APPEND-arguments finding. That original implementation was not reread in this assignment; historical evidence is attributed to its report. This assignment independently reads the complete repaired range.

## Finding disposition and API verification

**Prior HIGH R1: closed statically.** Lines 121–122 supply mailbox, flags, date_time and bytes message in the required order. Both optional wire fields are explicitly `None`; no argument is missing. The updated AIDEV comment explains the runtime/stub mismatch, and `type: ignore[arg-type]` is confined to this call.

[CPython 3.12 imaplib source](https://raw.githubusercontent.com/python/cpython/3.12/Lib/imaplib.py) defines `append(self, mailbox, flags, date_time, message)` at line 370 (one-based), permits None, normalizes flags/date_time, prepares the message literal, and skips None arguments in `_command`. Its `uid` method uppercases the command and forwards the supplied arguments; SEARCH returns SEARCH response data. Thus the current calls emit UID SEARCH SUBJECT followed by the fixed ASCII token, without an erroneous charset position. [Official API documentation](https://docs.python.org/3/library/imaplib.html#imaplib.IMAP4.append) independently documents the required signature. This is external stdlib reference inspection, not execution or inspection of imported project implementations; deployed interpreter identity and bundled stub contents were not independently examined.

## Mandatory rubric checklist

- Purpose/correctness: real SMTP/IMAP positive probes remain coherent; repaired APPEND permits the subsequent owned sentinel verification. No malformed APPEND or UID SEARCH call found.
- Null/empty/limits: supported None values now occupy the correct required positions. Zero or duplicate matching UIDs fail the exact-one assertion. Malformed credential/response shapes propagate failure. Fixture messages/tokens are small and fixed; arbitrary public input is not introduced. The retry uses a 45-second deadline with network-operation timeouts; that is not a hard whole-process deadline.
- State and coupling: delivery is checked in account B explicitly; each owned sentinel is verified, and A must not find B's sentinel or delivered message. Unknown account persistence and cross-account mailbox selection are denied by explicit assertions. Credential provisioning and caller isolation remain external dependencies.
- Design/simplicity/duplication: small connection helpers clean up and rethrow; the acceptance sequence is cohesive. No unnecessary new abstraction, class, duplicate repair logic, database query or unbounded collection was introduced. No design change requiring Obsidian tradeoff simulation is recommended.
- Naming/comments/conditionals: names communicate fixture/protocol roles; the repair updates the non-obvious API comment. No actionable nesting or responsibility defect found. Formatting remains a linter responsibility.
- Security/boundaries: verified TLS contexts, wrong-password checks, relay/submission rejection and mailbox isolation checks remain explicit. Tokens are fixed internal atoms; no new untrusted command input is introduced. Imported provisioning/credential custody is outside scope and not independently proven.
- Tests: the assigned file contains happy-path and multiple negative acceptance assertions (password, sender, relay, unknown recipient, mailbox and certificate rejection). Separate regression/unit tests were not assigned, read or run; a signature-faithful APPEND regression cannot be confirmed here. Runtime is separately owned and is not accepted by this review.
- Documentation/standards: prior report preserves the original failure; this report records final hash and closure. Deliberate failure propagation, bounded network operations, minimal targeted suppression and an explanatory anchor fit the applicable standards. Central documentation integration belongs to the coordinator.

## Counts and acceptance limits

**Zero new or remaining actionable defects in 141 reviewed LOC: 0 / 141 × 1000 = 0 defects/KLOC.** One historical HIGH closed; do not add overlapping original/final line counts or combine their defect densities. Accepted for bounded source correctness at the final hash only. No whole-project, production, release, backup/restore or runtime PASS is asserted. Only the assigned report was modified.
