# Felix REV936: QA816 attachment seed proof

Independent static review of Nadia `2e1cc302d5a295f25845e289161be4e4a807e19d` in `completion-nadia-send810`. Actual reviewer runtime: Orca Codex `gpt-6-sol` on local host; billed tier unverified. No application test, Docker, HTTP request, SQL query or live operation was executed by Felix. Fleet runtime: **NOT_RUN**.

## Exact bounded coverage

| File at pinned commit | Blob | Lines | LOC |
| --- | --- | ---: | ---: |
| `tests/acceptance/qa816-attachments-seed.rb` | `dcb4157ca46de30d94cf96826509d2370c803b16` | 131–240 | 110 |
| Same seed file, additional context | same blob | 1–26, 90–93 | 30 |
| `tests/acceptance/qa816-attachments-seed-test.rb` | `930f21b386f4117eea2e01e254c99f8ea225c2bd` | 1–54 | 54 |

**194 unique versioned LOC** in reads of 164 and 30 LOC, each under 200 and total under the assigned 194. Seed lines 27–89 and 94–130 were excluded; Maeve separately reviewed the first 130 lines. Other fixture, controller, storage and scanner source was not read here. The author worktree had later HEAD and unrelated dirty owner files; all quoted source came from the pinned Git objects, not that working tree.

## Finding

**LOW — missing negative oracles for the corrected HTTP response tuple.** The seed validates HTTP `200`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `application/octet-stream`, fixed safe `Content-Disposition`, expected `Content-Length`, and exact bytes before sidecar publication (`seed.rb` 165–182). The unit test has a positive tuple, foreign actor, and wrong body (`seed-test.rb` 25–53), but it never supplies a bad status, missing/unsafe header, or wrong content length. A regression that drops one of those independent response checks would leave the current focused tests green. Add fake response cases that individually mutate status and at least one safety header/length; assert failure before publication. This is a **test coverage defect**, not a demonstrated production failure.

**Defect count: 1 LOW / 194 LOC = 5.15 defects/KLOC.** No other confirmed defect was established within this packet.

## Source-supported behavior and limits

The seed validates the reader cookie as 16–4096 printable ASCII bytes before putting it in a `Cookie` header, checks a real session response's actor ID against the seeded reader, and forwards bounded context/version tokens to the attachment request (`161–189`). `private_get` returns a status/header/body tuple from the actual `Net::HTTP` response and caps accumulated body bytes at 4096 (`185–202`), so `verify_authorized_bytes` compares the response it receives rather than invented metadata. The positive fake verifies request sequence and context forwarding; the wrong-actor fake proves attachment fetch is not reached after a mismatched session ID. These tests are source claims only because no runtime ran.

The administrative tuple query checks organization, mailbox, thread, message and attachment IDs together, plus expected scan verdict/count and private object bytes (`131–158`). The sidecar contains IDs and metadata, not a storage key, and is written through an exclusive `NOFOLLOW` 0600 temporary file, flushed and fsynced, then published by hard link and directory fsync (`205–227`). The destination is a fixed `/acceptance/qa816-attachments.json`; an existing file or symlink is not overwritten by `File.link`. The foreign tuple emitted at `211–212` contains the foreign mailbox/thread/message/attachment IDs, but its creation and authorization behavior are outside these lines. Directory trust, real permission enforcement, and crash durability need fleet evidence.

The helper and test names describe their purpose, and the bounded proof is split between authorization, transport and publication without new hot-path loops or repeated per-item HTTP reads. The tuple loop is fixed at four fixtures; response body and sidecar are capped at 4096 bytes. This packet cannot prove unknown SQL callers, broader null/empty/max inputs, no-PII browser output, or runtime performance. Formatting is delegated to linters. Owner docs were inventoried but this review does not claim their runtime assertions. Soren's fleet test and actual-reader HTTP proof remain required.

Nadia FIX933 dispatch `ctx_9c35a8f1df7e` was completed when direct delivery was attempted. The coordinator received the finding for forwarding to Nadia and Cassian; the shared Felix outbox also records it.
