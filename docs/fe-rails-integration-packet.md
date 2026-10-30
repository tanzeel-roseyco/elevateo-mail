# FE next-checkpoint packet: real Rails integration and mutation flows

Date: 2026-10-12. Status: **read-only planning packet for review — nothing here is authorized,
dispatched, consulted or implemented**. Sources: `.planning/TASK_BACKLOG.md`, the FE-01
[brief](../.planning/consultations/results/fe-01/brief.md) and accepted
[decisions](../.planning/consultations/results/fe-01/decisions.md) (FE-D01–D08), FE-01-R1
synthesis, BE-01 decisions (B01-01–06), `documentation.md` (R01–R17),
`docs/contracts-and-reliability.md`, `contracts/v1/openapi.json` (1.0.0-read.1, schema SHA-256
`94c5f31b…`). No new consultation was run and no product source changed. FE baseline (updated
2026-10-12, superseding the earlier "frozen r7" line): the r11-validated read checkpoint — HEAD
284aa71 plus the four reviewed repair files, fully validated on fleet-02 (see Addendum 2).

## 1. Where we are and the dependency chain

The FE-01 read checkpoint (fixture-backed session gate + mailbox/inbox/plaintext reader over the
four frozen GET operations) is implemented, Docker-verified (r11: 209 unit / 163 browser PASS,
superseding the r7 figures) and reviewed, with all 112 visual-state captures inspected at zero
defects (agent visual verification). Everything below is the explicitly open remainder of FE-01: by FE-D01, no mutation
surface may ship until its full safe contract is accepted, and FE-01 cannot close without real
BE-02–BE-05 integration — fixture success never proves backend integration.

Prerequisite tasks, in order (backlog rows; a dependency is met by **accepted evidence**, not a
plan):

| Gate | State today | Blocks |
| --- | --- | --- |
| BE-01 foundation (Rails/Supabase skeleton, RLS, roles) | INCOMPLETE: Devin draft PR #5 now at `5785eba` (parent-corrected base; checkpoints A/B still unaccepted) | Everything below |
| BE-02 sessions/memberships/thread/message/draft/search APIs | Not started (needs BE-01) | FE Stage I–II, AI-01 |
| BE-03 atomic approval/snapshot/job/audit | Not started | FE Stage III |
| BE-04 provider interface + local simulator | Not started | FE Stage III job outcomes |
| BE-05 inbound/attachments/quarantine/authorized download | Not started | FE Stage IV |
| Per-stage consultation gate (R12) | Fresh three-model opinions + Astra MAX synthesis required before each FE mutation dispatch; FE-D05 directions exist but froze no endpoint | Every FE stage |

Operational prerequisites (updated after r11): fleet-02 is RELEASED by the FE session (msg
`e78cd0cc`) and currently owned by BE-01 for Python regression work; FE holds no reservation and
requests none — any future FE run goes through the Codex coordinator's ledger. The ~5.7 GB
figure recorded at the r8 handover was the local Windows C: drive, NOT fleet-02 Docker host
space. Single frontend writer; coordinator owns the canonical contract (FE-D02) — the FE writer
cannot author or amend `contracts/**`.

## 2. Missing server contracts (must be frozen before dependent FE code)

Current `contracts/v1` covers only the four read GETs. Gaps, each owned by the coordinator with
the named backend task:

1. **Session lifecycle (BE-02, FE-D03):** login/logout routes, cookie/CSRF/origin policy for
   unsafe requests (per-session CSRF token exists in the Session DTO but no unsafe request uses it
   yet), organization selection, revocation response. Until frozen, no sign-in/sign-out UI — the
   read checkpoint's "unauthenticated" screen stays terminal with no fake local sign-out.
2. **Drafts (BE-02, FE-D05):** create/patch/read/list DTOs; server draft id + integer revision;
   JSON `expected_version` with HTTP 409 `draft_conflict` (accepted; the legacy 412 branch is
   rejected and the shared reliability doc still needs reconciliation); field sizes/recipient
   counts; reply references; authoritative saved response.
3. **Idempotency/uncertain-write protocol (BE-02/03, FE-D05):** durable operation lookup with
   ownership, retention and payload matching that survives concurrent updates. The accepted
   decision explicitly says a single `last_client_request_id` field is insufficient. This must be
   specified BEFORE draft implementation.
4. **Review envelope + send (BE-03):** separate authorized review envelope for an exact saved
   revision (accepted direction, no frozen endpoint); `POST /v1/drafts/:id/send` binding
   `draft_id`, `expected_version`, `client_request_id`; 202 = durable queued intent;
   lost-response reconciliation without inventing a new send.
5. **Job status/cancellation (BE-03/04):** job DTO with `queued/cancelled/dispatching/accepted/
   unknown/rejected/needs_review`; cancellation boundary and conflicts; **polling/backoff/expiry
   fields** — this is where the automatic scheduler finally enters scope and unlocks the
   scheduling-horizon regression recorded in `transport-boundaries.test.ts`.
6. **Collaboration and search (BE-02):** minimal assignment/note/per-user-read/search routes;
   unavailable controls are omitted in real mode, never simulated locally.
7. **Attachments (BE-05):** upload/quarantine/scanning/rejection/download states and limits;
   authenticated server download only, no direct Storage URL.
8. **Contract mechanics (FE-D02):** each amendment regenerates `openapi-typescript` types, bumps
   the schema hash recorded in `contract.ts`, and extends the Zod runtime schemas + conformance
   and code-point-boundary tests. New error codes (e.g. `draft_conflict`) extend
   `API_ERROR_CODES` and `ErrorSchema`.

## 3. FE implementation stages and UI flows (in dependency order)

Each stage is a separately consulted, bounded dispatch; one writer; `apps/web/**` only.

- **Stage I — real Rails reads + session lifecycle (needs BE-02):** point the existing
  `httpGateway` at real Rails (the gateway port and transport already conform; this is
  integration evidence, not rewrite); login/logout UI per the frozen session contract; CSRF/origin
  on the first unsafe request; real revocation/context_changed behavior validated against the
  session controller (D2/D3 recovery, readEpoch restart). Closes F02's real-integration half.
- **Stage II — durable drafts + composer (needs BE-02 + gaps 2–3):** composer with honest
  unsaved/saving/saved/conflict/error states; serialized autosave; conflict preserves the local
  buffer with explicit compare/reload recovery; unsaved-navigation warning; reload-survival. New
  mutation path through `MailroomGateway` commands; `src/domain` stays pure. Closes F04.
- **Stage III — exact send review, jobs and status (needs BE-03/04 + gaps 4–5):** review
  envelope at one saved revision; edit invalidates review; single `client_request_id` across
  double-click/lost-response; job status panel with authoritative states ("accepted" is never
  "delivered"; "unknown" never offers blind resend); cancel only when the server allows it;
  bounded polling/backoff per the frozen job DTO (the first legitimate automatic scheduler —
  implement the deferred scheduling-horizon regression here). Closes F05/F06.
- **Stage IV — attachments + collaboration + settings (needs BE-05 + gaps 6–7):** server-owned
  attachment states and authorized download; assignment/note/read/search actions under current
  grants; settings expose session/account/mailbox info + local appearance only. Closes F07.
- **Cross-stage:** every stage repeats F01/F03/F08/F09 on its own surfaces (visual QA matrix
  extends per stage), full adversarial review at ≤200-line assignments + design reviewer with
  density recorded in `code-reviews.md`, Docker-only checks on fleet-02, exact cleanup.

## 4. Out-of-scope here (kept explicit for full-project completion)

This packet covers only FE-01's remaining Rails/mutation slice. Still separately gated and NOT
part of this packet: FE-02 (Anime.js motion, Opus-owned), AI-01/02/03 connectors, TOOL-01,
DESK-01, MOBILE-01, OPS-01, RELEASE-LOCAL and ACTIVATE-01; live mail stays prohibited until the
no-live-send constraint is explicitly changed (R17). Rich-HTML rendering, offline replicas,
IMAP/calendar sync and account-management mutations remain excluded by the FE-01 brief.

## 5. Proposed immediate next actions (for parent decision; none taken)

1. Resume/complete BE-01 to acceptance (Devin, existing credit terms) — hard blocker.
2. Coordinator drafts the BE-02 contract amendment covering gaps 1–3 and 6, then runs the
   mandatory fresh three-model consultation + Astra synthesis for the FE Stage I/II dispatch.
3. DONE (see Addendum 2): `visual-states.spec.ts` executed through r8–r11 and the full
   112-capture matrix inspection completed at zero defects. No contract-free FE evidence work
   remains; the FE side is blocked exclusively on gates 1–2 above.

## Addendum — facts reconciled 2026-10-12 (later same day)

- `visual-states.spec.ts` is now FROZEN at SHA-256 `2b0fedfb…f606eb5` (267 LOC, 27 scenarios)
  after two independent passing re-reviews (zero defects; ledger in `code-reviews.md`).
- The parent accepted the r8 proposal (`docs/r8-validation-proposal.md`) for snapshot
  preparation. The r8 snapshot is PREPARED (archive SHA-256
  `736bf53140072552f34e1716f8f1189f4d2dfb30db433fc85ae29b538ae5e2d0` in
  `Elevateo Mail - FE Validation 20261012-r8`); its sole content delta vs the r7 snapshot is
  that frozen spec. Reservation update (later 2026-10-12): backend cleanup independently
  verified and its reservation released; fleet-02 is now exclusively reserved for this r8 run,
  which the parent authorized for execution.
- All other packet facts (dependency chain, contract gaps, stage plan) are unchanged.

## Addendum 2 — r8–r11 executed and inspected (2026-10-12, latest)

The evidence work this packet proposed is COMPLETE. Four fleet-02 rounds ran under
coordinator-granted exclusive reservations (r8 156/4/50 → r9 158/2/50 → r10 160/0/50 → r11
163/0/50 browser), each delta hash-frozen and review-gated. r11 (task
`fe01r1-20261011-232744-84542099`, archive `0eedf661…b0a350`) is the accepted set: runner exit
0; lint/typecheck/209-unit/coverage/build PASS; 112/112 visual PNGs captured; exact per-command
cleanup attested; fleet released (msg `e78cd0cc`, now BE-01-owned). The r10 visual defects
(invisible light skeletons; 390px badge overflow) were repaired (`--skeleton` token,
footer flex-wrap), review-gated and re-validated. All 112 r11 captures were individually
inspected locally: 112/112 PASS, zero defects — agent visual verification of the read
checkpoint, not whole-app acceptance. The spec is frozen at SHA-256 `1c8f1f3d…6771a` (350 LOC),
superseding the `2b0fedfb…` freeze above. FE work is now blocked solely on BE-01 acceptance and
the BE-02 contract amendment + per-stage consultation gates; no FE Docker reservation is held or
needed until Stage I dispatch.
