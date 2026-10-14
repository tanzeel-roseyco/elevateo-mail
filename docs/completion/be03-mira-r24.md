# Mira BE03 UI R24 — isolated implementation

Root authorizes isolated implementation over baseline `03ae770c56271cd8236726bfd8fe63248e81283d` on `delivery/mira-r24`. BE02 remains OPEN/unaccepted; integration/release stay gated. Deadline 2026-10-14 12:17 UTC. Requested Fast is not verified effective billing.

Ownership: MailroomGateway, generated web client after Cassian canonical contract receipt, send review/approval/status/cancellation UI and tests. No canonical contracts, backend, SQL, worker or production configuration edited. Incoming dispatch wrong YAML reference corrected to `contracts/v1/openapi.json`; root sequencing supersedes historical dispatch blocking prose.

S1/S2 source: saved clean draft review link; full literal sender/ordered recipients/subject/body/purpose/no-attachments review; explicit self-approval attestation; original operation/version/digest binding retained in owner-scoped memory for uncertain response retry; durable status read by stable send ID. Scope guards drop late results; retained binding contains no CSRF proof or snapshot bytes and clears on logout/principal change. No browser persistence or cross-tab/reload recovery is claimed. Status distinguishes simulated queue, uncertainty, acceptance and late stop; no delivery or safe resend inference. No automatic approval or worker retry.

Regression source covers happy review/approval/queued flow, stale review/version, lost response exact retry, mismatched review/receipt, empty/nonready and literal hostile text, scope recovery, logout late results, cancellation ambiguity, independent send error envelope, input closure/Unicode/byte bounds and cancellation signals. These are source tests, NOT runtime evidence yet.

Current checks: source whitespace `git diff --check` exit0. Application lint/type/unit/build/generation NOT_RUN (fleet Docker/Soren only). Canonical generated artifact pending immutable contract receipt. Actual browser/visual validation NOT_RUN. Independent adversarial functional/data and dedicated design reviews pending root dispatch. No defects/KLOC acceptance claim before reviews. No Docker resources created; no cleanup required yet. Persistent resources, prior evidence and Lyra preview18140 untouched.

Coordination: `incoming/be03-r24-coordination/mira-signatures.md`, `mira-status.md`; Cassian contract, Nadia API, Rowan SQL, Soren lease/testing. Integration owner retains central review ledger and acceptance authority.

Canonical receipt paired by merge `405056f` with exact Cassian `3d01babe0fff976e9ea14045981ad7e7c77810fa`, preserving both parents. State conflict preserved both owner notes. Validator aligned to sender320/policy_revision19/issues120 and ready/digest conditional. Self-inspection corrected unconfigured DOM matchers in new tests (no new dependency), added editor save->review->queued regression and guarded a stale completion from downgrading an already approved binding; runtime still pending.

Corrected canonical receipt `aa35c3d` supersedes `3d01babe`: validator allows policy revision `0` for nonready display and up to210 readiness issues; no client policy authority added. Original generated artifact pending Soren-authorized lightweight Docker recipe, now available.
