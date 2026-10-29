# Bounded HTTP approval adversarial review

Dispatch: `ctx_ee0cd0726d88`; task: `task_21d7df3d34a8`. Read-only source review on 2026-10-24; only this report is owned by this worker. Implementation/testing owner is `ctx_4be80c8bfe6d`.

## Source binding and coverage

| Packet | Inclusive lines | SHA256 | Defects | Density |
| --- | --- | --- | --- | --- |
| `apps/server/test/support/launch_mailflows/http_approval.rb` | 1–66 | `9a0a61280404b3e6f1754813b91218365f61232fb676dba29d915ba3e0f38e6f` | 1 MEDIUM | 15.15/KLOC |
| `apps/server/test/support/launch_mailflows/http_chain.rb` | 1–110 | `77e0e3e98eb2e5b4880edf3a3acd235e277c7bf328aec9d9c30665f957d4bf1d` | 0 | 0/KLOC |

Total: 176 target physical lines, one defect, 5.68 defects/KLOC. Supporting read-only context: `ops/tests/be02/http_support.rb` lines 1–100 and `apps/server/test/support/launch_mailflows/app_chain_test.rb` lines 111–170; 336 unique source lines including context, below the 350-line ceiling. Supporting context is not additional fully reviewed coverage. Final target hashes were reobserved unchanged before report creation; later edits invalidate the binding.

Read project instructions, README, state, documentation and `.planning/STANDARDS.md`. The initial combined documentation output was truncated; current checkpoints and complete standards were visible. Review applies the supplied functional/security rubric; formatting belongs to lint.

## Actionable finding

**MEDIUM — replay assertion can miss duplicate queued work (`http_approval.rb:53–55`).** The replay must return the original `send_id`, but the persistence query counts only rows with both this draft and that original ID. An implementation that returns the original response while accidentally inserting another intent under a different ID would pass. Assert total `app_send_private.intents` count for this draft is exactly one after replay, in addition to matching the returned ID; checking the stored operation binding would strengthen this further. This is a test-oracle defect, not evidence that the production approval implementation actually duplicates work. Sent promptly to coordinator as `msg_f1b43516d6bf`.

## Requirement checks

- Public approval: POST goes to `/v1/drafts/:id/send-approvals`, accepts 202, checks draft/version/digest/non-simulated response and forwards the returned ID to the real worker. Target SQL changes grants or observes drafts/intents; neither target inserts an approval/intent with SQL. Supporting caller runs that ID through the worker and checks an isolated IMAP reply.
- Staleness: obtains reviews at versions 1 and 2, asserts digest changed, rejects an invalid digest at current version and an actual old digest with old version. This does not isolate rejection of an actual old digest paired with the current version.
- Authentication/CSRF: new cookie-free client must receive 401; invalid CSRF must receive 400 with `request_invalid`; denied approval checks assert zero persisted intents. Draft CSRF rejection also asserts zero draft rows.
- Authorization/revocation: removes only approve-send permission while retaining compose, refreshes session and requires 404/no intent; restores permission and refreshes before success. This proves current-grant denial, but does not test rejection using the pre-revocation session/context. Ungranted mailbox read omission and denied draft creation are covered.
- Persistence: separate administrative reads check zero effects on denial, persisted draft version 2, and existence of the returned intent. No restart/recovery or immutable snapshot-content persistence is established by these packets.
- Inputs/limits: fixture UUIDs and fixed addresses are controlled; SQL uses parameters; required JSON keys fail visibly with `fetch`; empty inbox cannot silently satisfy the happy path. Null/malformed request bodies, recipient maxima, concurrency and pagination are outside this narrowly scoped single-reply proof.
- Design/maintenance: small shared HTTP and approval helpers have clear responsibilities; comments explain proxy limitations, actor-private drafts and distinct grants. No extra runtime dependency, unbounded query loop or secret logging introduced in the targets. General session/transport correctness remains delegated to existing helpers and their tests.

## Evidence limits and disposition

Static review only: no tests, builds, UI, network service calls, SQL execution, external mail or deployment were performed. No runtime PASS, whole-system approval, browser TLS/SameSite acceptance, production delivery or release authorization is claimed. Coordinator/implementation owner must run fleet Docker validation against the exact final source and repair or explicitly disposition the replay-oracle finding. Dedicated deep design review is separately coordinator-owned; no nested agents were launched.
