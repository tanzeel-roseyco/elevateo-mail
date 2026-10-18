# REV844 bounded static review: Corin IMAP attachment ingest

Reviewed exact Corin commit `664b4a98f8b9afc02040cce9ffdb47d45781fef6` in actual worktree `completion-corin-mail819` (the dispatched `completion-corin-imap819` path did not exist). Reviewer runtime identity: Codex `gpt-6-sol`, dispatch `ctx_f8e352617b5f`, task `task_ec86a869c844`. Review date 2026-10-14. No application test, Docker job, Storage call, or benchmark was run by Felix.

## Exact coverage

| File | Versioned lines | Unique LOC | SHA-256 |
| --- | ---: | ---: | --- |
| `apps/server/db/migrate/20261015000017_add_imap_attachment_ingest.rb` | 1–88 | 88 | `2d3e5049b20becf86e0377af87265339dd97b23c8da763dcdf39df4421a09e26` |
| `apps/server/lib/elevateo/inbound/imap_attachment_parser.rb` | 1–82 | 82 | `32a4ba71b2e797da816b57ccb4f46deaa88d1e8a2834e4c3a3b72a4e281e205f` |
| `apps/server/lib/elevateo/inbound/imap_ingress.rb` | 1–65 | 65 | `0ed0d42061f716941411d9223aba9349fd14c4572c0e2baee0e2506958f91b73` |
| `apps/server/test/inbound/imap_attachment_database_test.rb` | 1–61 | 61 | `bdbc52fed062f912a4f6de46a0a4b97697741ad272e51d87249a8d9b021c5aa4` |
| `apps/server/test/inbound/imap_attachment_parser_test.rb` | 1–47 | 47 | `cf179b6867310b70eb4651303634c0ed889109a2c74b9dbf92cfd990493f0b82` |

Two reads of 170 and 173 lines; **343 unique versioned source LOC** against 350 maximum, each read below 180. Excluded due cap: `imap_worker_store.rb` 1–84, `imap_sync.rb` 1–66, `fake_ingress.rb`, old migration 00012, Nadia migration 00015, broader helper/tests and later thread fixes. Nadia 00015 policy status comes from the separately recorded Felix review at `9086280`, not a fresh read under this packet. Commit `664b4a9` itself renames migration 00016 to 00017 and updates documentation; this packet evaluates the exact resulting source for integration.

## Finding

**HIGH integration blocker, inherited from Nadia 00015; no new Corin-owned source defect confirmed.** Migration 00017 calls `app.bind_imported_inbox_attachment` after inserting receipt, thread and message but before cursor advancement (lines 47–74). Nadia 00015 enables and forces RLS on `app.inbox_attachments`, yet has no `elevateo_owner` INSERT/SELECT policy for that SECURITY DEFINER binder. On the currently reviewed migration pair, the attachment-positive call cannot insert metadata as intended unless an unshown BYPASSRLS privilege applies. Corin's positive direct-SQL test at lines 24–33 should expose this once Soren runs migrations with actual roles; runtime is **NOT_RUN**, so the precise PostgreSQL error is unmeasured. Nadia owns the policy repair; Corin should retain the 00017 transaction and rerun the positive/rollback test after the repair. Root and Corin received immediate orchestration notices `msg_30f4e0e31144` and `msg_a4bdde79f5ad`.

Defect accounting: **0 newly confirmed Corin source defects (0.00/KLOC)**; **1 confirmed inherited integration blocker affecting this 343-LOC packet (2.92/KLOC, nonadditive with Nadia ATT823 review)**. No runtime defects counted.

## Functional and design assessment

Migration 00017 locks the account, checks active/version, positive UID/UIDVALIDITY, SHA shape, sender/recipients, subject/body caps, array type and count before writes (lines 19–35). It compares same-UID replay digest before returning duplicate, and inserts receipt, thread, message, each attachment bind, then advances cursor inside one function transaction (37–76). Invalid handles raise before cursor update; PostgreSQL function error should roll back all database writes. The binder is worker gated, the definer search path is fixed to `pg_catalog`, and public/API execute is revoked. This is a purposeful transaction boundary, not needless additional abstraction.

`ImapIngress` validates account/credential/UID types, uses the existing MIME validator, computes stable quarantine keys, calls `put_once` per bounded attachment, and calls SQL only after staging (26–61). The parser rechecks MIME structure, attachment count, allowed types, decoded size and digest, with bounded depth/leaves (23–79). The double MIME parse costs extra work on the inbound hot path, but raw input, leaf and batch bounds constrain it; no measured latency or memory budget exists. Private bytes remain outside SQL and are intentionally orphaned on failed bind for explicit review, as Corin documents; that cleanup/retention policy is an open integration concern, not a newly demonstrated code defect. Names and why-comments convey the transaction and trust boundaries; no confirmed avoidable state mutation or duplicate domain backend appears in this packet. Formatting belongs to lint.

The parser tests cover accepted plaintext/PDF and unsupported, oversize and malformed inputs. The database tests cover successful metadata/replay, invalid-handle rollback and API rejection, but invoke SQL directly without `ImapIngress` or actual private Storage, so they do not prove staged bytes and metadata together. Other adapter tests may exist outside the read cap. Empty attachment array, null/malformed JSON, account revocation between staging and SQL, max 11 attachments, and actual role-level RLS behavior need Soren's integrated fixtures. Corin's docs correctly label source as candidate and runtime pending; no live IMAP or scanner claim is made.

**Soren request:** on the exact integrated source after Nadia policy repair, run disposable migration 00015+00017 role fixture, positive attachment bind, invalid-handle rollback, duplicate and digest mismatch, inactive/version-changed account, empty and max attachment arrays, and an ingress fake Storage `put_once` fixture. Record exact SHA, role identities, cleanup, and measured timing/memory only if executed. No live credentials or mail.
