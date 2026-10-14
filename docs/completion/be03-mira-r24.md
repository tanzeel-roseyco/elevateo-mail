# Mira BE03 UI R24 — isolated implementation

## Final owned source checkpoint

Implementation source `8f6f5bf8758582ec58d40eefe69d9fd1208cf2ff` is reviewed and frontend-tested. **BE02 stays OPEN/unaccepted; integrated SQL/HTTP, actual browser/visual acceptance and release remain gated/pending.** No BE03 application-completion claim.

| Exact source | Actual Docker evidence | Exits |
| --- | --- | --- |
|607fcb2c|Pinned generation/APIcheck/lint/type;8files260affectedtests|all0 after retained setup failures|
|e037cb9b|APIcheck/lint/type;full37files660tests; production npm build; fixture-marker isolation|all0|
|8f6f5bf8|Final fixture-only abort repair; lint/type;9files174affectedtests|all0|

One LOW self-found fixture abort parity defect is repaired; independent40LOC repair review found0new defects. Functional/data/design and generated/test follow-up reviews found0confirmed defects, with overlapping coverage explicitly nonadditive. Seven exact task-owned containers are independently absent after--rm. Shared image, Lyra18140 and all persistent resources are preserved; no image/volume/network build/removal, install, provider/live/paid path or database lease. Failed setup histories remain retained. See [sanitized runtime and cleanup receipt](be03-mira-r24-runtime.json).

Owned changed paths: `apps/web/src/data/{gateway,errors,sendContract,generated/api.d,http/httpGateway,http/transport,fixtures/fixtureGateway}.ts` (generated artifact isapi.d.ts); app routing and memory store; draft editor review link; `features/send/` screens/synthetic test data/regressions; send contract/conformance/signal/store tests. README/state/documentation and this scoped record are synchronized. Cassian canonical contract commits3d01babe/aa35c3d are imported dependencies, not Mira-authored contract changes; schema blob is byte-identical to currentb38/099. Dispatch canonical-path correction is outside the checkout in the incoming coordination packet. Central review integration remains Cassian-owned; exact independent reports/coverage sent for its ledger.

Full refresh loses memory-only approval retry details; no cross-tab/durable browser recovery claim. Queued intent is a server response; frontend fixture tests do not prove PostgreSQL atomicity. Cancellation UI is present, backend S3 cancellation may still fail closed; no worker/provider execution is claimed. Effective Fast billing remains unverified.

## Earlier checkpoints and retained evidence

Root authorizes isolated implementation over baseline `03ae770c56271cd8236726bfd8fe63248e81283d` on `delivery/mira-r24`. BE02 remains OPEN/unaccepted; integration/release stay gated. Deadline 2026-10-14 12:17 UTC. Requested Fast is not verified effective billing.

Ownership: MailroomGateway, generated web client after Cassian canonical contract receipt, send review/approval/status/cancellation UI and tests. No canonical contracts, backend, SQL, worker or production configuration edited. Incoming dispatch wrong YAML reference corrected to `contracts/v1/openapi.json`; root sequencing supersedes historical dispatch blocking prose.

S1/S2 source: saved clean draft review link; full literal sender/ordered recipients/subject/body/purpose/no-attachments review; explicit self-approval attestation; original operation/version/digest binding retained in owner-scoped memory for uncertain response retry; durable status read by stable send ID. Scope guards drop late results; retained binding contains no CSRF proof or snapshot bytes and clears on logout/principal change. No browser persistence or cross-tab/reload recovery is claimed. Status distinguishes simulated queue, uncertainty, acceptance and late stop; no delivery or safe resend inference. No automatic approval or worker retry.

Regression source covers happy review/approval/queued flow, stale review/version, lost response exact retry, mismatched review/receipt, empty/nonready and literal hostile text, scope recovery, logout late results, cancellation ambiguity, independent send error envelope, input closure/Unicode/byte bounds and cancellation signals. These are source tests, NOT runtime evidence yet.

Initial source checkpoint checks: source whitespace `git diff --check` exit0. Application lint/type/unit/build/generation NOT_RUN (fleet Docker/Soren only). Canonical generated artifact pending immutable contract receipt. Actual browser/visual validation NOT_RUN. Independent adversarial functional/data and dedicated design reviews pending root dispatch. No defects/KLOC acceptance claim before reviews. No Docker resources created; no cleanup required yet. Persistent resources, prior evidence and Lyra preview18140 untouched.

Coordination: `incoming/be03-r24-coordination/mira-signatures.md`, `mira-status.md`; Cassian contract, Nadia API, Rowan SQL, Soren lease/testing. Integration owner retains central review ledger and acceptance authority.

Canonical receipt paired by merge `405056f` with exact Cassian `3d01babe0fff976e9ea14045981ad7e7c77810fa`, preserving both parents. State conflict preserved both owner notes. Validator aligned to sender320/policy_revision19/issues120 and ready/digest conditional. Self-inspection corrected unconfigured DOM matchers in new tests (no new dependency), added editor save->review->queued regression and guarded a stale completion from downgrading an already approved binding; runtime still pending.

Corrected canonical receipt `aa35c3d` supersedes `3d01babe`: validator allows policy revision `0` for nonready display and up to210 readiness issues; no client policy authority added. Original generated artifact pending Soren-authorized lightweight Docker recipe, now available.

## Observed lightweight Docker evidence on607fcb2c

Soren recipe/root authorization: immutable retained fixture image `sha256:27bde67943dfe9c1ddf5c862e305957474f56457c786f641768b10aad13c9f53`, Node24.21.0, exact package-lock `cmp` PASS. Task-owned read-only/network-none containers, user1001, memory768MiB/CPU1/PIDs128, task-private tmpfs and owner0700 output; no install/build/pull/database lease.

- Check1 exit126: private output permission setup, zero checks/cases; retained.
- Check2: generate-api0/check-api0/lint0/typecheck0; unit1 startup EROFS Vite cache, zero cases; retained.
- Check3: generate-api0/check-api0/lint0/typecheck0; unit1 startup EACCES private tmpfs mode, zero cases; retained.
- Check4: corrected disposable cache mode, affected suite **8files/260tests PASS, exit0** (new send24 + existing affected236). Original source identity remains607fcb2c; follow-up generated/type-parity/tests require their own checks.

All four exact `--rm` containers independently absent immediately after jobs. No image/volume/network created or removed. Retained shared image/Lyra preview18140 and all persistent resources preserved. Evidence: `reports/mira-r24-ui/source-receipt.json`, `check-607fcb2c/`, `check-607fcb2c-unit/`, `check-607fcb2c-unit4/`, `cleanup-607fcb2c.json` (private task evidence outside Git).

Independent reviewed source607fcb2c: SPEC-BE03M01 data/gateway/status271unique changedLOC/0confirmeddefects/0KLOC; SPEC-BE03M02 review/store/tests367unique changedLOC/0confirmeddefects/0KLOC; SPEC-BE03M03 dedicated design~358productionLOC/0confirmeddefects/0KLOC (overlaps functional coverage, nonadditive). Full INT401 rubric, each read<=200LOC and divided assignment<=400. Reports in incoming coordination `spec-mira-{data,ui,design}-review.md`; source review does not establish runtime/visual acceptance. Root/Cassian own central review integration.

Follow-up: exact Docker-generated artifact applied unchanged; runtime validators alias generated send component types, bidirectional compile-time parity and canonical fixture tests added. Reviewer-suggested maximum100recipient rendering, original-binding retry against newer review with fresh CSRF, and owner/logout store-isolation tests added. New runtime checks and bounded follow-up review pending.

Successor `e037cb9b2db46b76e3988a8e9db34cb5dc2f3a8e`: API artifact check/lint/typecheck/full unit **37files/660tests PASS**, all exits0. Capped production `npm run build` and fixture-marker isolation PASS, exits0; no image build/install/network. Bundle gzip156.96kB, ordinary Vite>500kB chunk warning retained (no runtime failure). Follow-up reviews: data333LOC0defects; UI323LOC0defects; dedicated design100changedLOC0defects, overlapping/nonadditive. Exact containers check5/build6 removed by--rm and independent absence verification follows.

Self-inspection found one LOW adapter parity defect: the four default-unavailable send fixture methods ignored an already-aborted caller. Production HTTP methods were unaffected. Corrected fixture methods check abort before503, with12preabort/live-unavailable/midflightHTTP regression cases. Affected lint/type/9files174tests passed exit0 and independent40LOC review found0new defects; no completed-BE03 claim.

Final evidence: check7 lint0/type0/unit0,9files174tests; exact name absent immediately after job. Seven total owned containers independently absent, shared dependency image and Lyra18140 independently observed retained. Sanitized runtime receipt includes exact source/tree/schema/generated identities and log hashes, without raw payloads or credentials.
