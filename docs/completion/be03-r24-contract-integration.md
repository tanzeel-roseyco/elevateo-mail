# BE03 R24 contract and integration record

Cassian BE03-CONTRACT owns canonical contracts, source manifest and central documentation on delivery/cassian-r24, baseline03ae770. Root explicitly authorizes isolated implementation in parallel with BE02 acceptance; BE02 remains OPEN, integration/release gated. Deadline12:17 UTC. S1+S2 takes priority over S3-S5. No runtime acceptance or completion claim.

## Source and frozen boundary

Canonical path is contracts/v1/openapi.json; the incoming dispatch's wrong contracts/openapi.yaml was corrected in place and its blocking sequence annotated with root's override. Additive version1.0.0-send.1 introduces SendReview, ApprovalResult, SendStatus, CancellationResult, closed approval/cancellation inputs and independent SendError. Existing C/D operations/components and fixtures remain frozen; be03-preservation.json contains normalized section seals and the original fixture byte hash. New send-fixtures.json is synthetic. Contract-lock records pending generation and retains the prior generation receipt as historical.

Signatures are published in incoming/be03-r24-coordination/cassian-contract.md. Rowan owns every SQL/migration change; Nadia owns Rails routes/config/load/controller/service/RBS seams; Mira owns web generated artifacts/gateway/UI; Elara owns isolated offline worker modules. Approval SQL is app.approve_draft_send(text,uuid,uuid,uuid,integer,text,bytea,uuid)->jsonb. Server-derived snapshot/epoch cannot be browser request fields. Approval return metadata is freshly authorized. Stable send_id is the sole intent/job identity. No approval-operation GET.

## Evidence and review

Actual application tests/generator/lint/type/build/API/worker/UI: NOT_RUN in this source-preparation checkpoint. Structural regression suite covers baseline preservation, four routes, synthetic ready/not-ready/approval/queued/cancelled/error shapes, positive draft versions, original binding-only inputs, no snapshot disclosure, no delivery/reset states. Tests must run in fleet Docker through Soren after bounded source review. Static source preparation is not runtime proof.

Root dispatches <=200-line review packets (<=400 per assignment) plus dedicated design review from Cassian's immutable packet manifest. Findings/defects/KLOC will be recorded in code-reviews.md once received. No design-opinion record substitutes for changed-source adversarial coverage.

## Resources and remaining work

No Docker resources created and no cleanup/deletion commands executed by Cassian. Preserve all persistent resources, Lyra preview port18140, source86036/51ca and previous evidence. Soren alone schedules shared heavy-test lease; exact task cleanup immediately follows each job. Required next evidence: reviewed exact worker receipts, integrated S1+S2 source, real PostgreSQL/Auth/API tests, generated client strict checks and actual UI validation. Actual vault remains root-owned and unsynchronized; no vault write here. Observer OFF. No live sends, production activation, paid paths, research or ultrareviews. Effective Fast unverified.

## Initial independent review and source repairs

SPEC-BE03-C01/C04 confirmed two MEDIUM schema interface defects: issues max120 rejected up to200 recipient issues plus globals; positive-only policy_revision rejected absent-policy sentinel0. Source now allows210 bounded issues and decimal0 on non-ready display. Runtime must still deny approval without positive enabled policy. SPEC-BE03-C03 confirmed one MEDIUM preservation defect: the authoring helper mistakenly loaded current additive source on re-run, resealing added keys. Manifest now derives only immutable03ae; a pinned independent keyset/seal fingerprint in the Docker-only regression test rejects additive resealing. New regression covers100 recipients with two issues each plus missing policy. No application tests run by this source repair.

Re-review aa35c3d: C09/C10 statically closed original manifest and two schema findings. C08 found one residual MEDIUM checksum-test gap; the immutable original fixture fingerprint is now separately pinned so simultaneous fixture/manifest edits cannot pass. Exact210/211 issue boundary regressions added. Four unique review findings across stages, all repaired in source; final independent test re-review and fleet Docker runtime pending. No overlap added to unique coverage.

## Fleet standalone contract result

Exactb38d5b9 ran Docker-only on the retained pinned Ruby3.4.11 base/minitest5.25.4:8runs/78assertions/zero failures/errors/skips, exit0. Initial nonroot read denied by archive permissions stopped setup with exit1 and zero cases; retained unchanged log. Snapshot modes corrected, source bytes unchanged; second exact-name --rm run passed. Both exact containers independently absent immediately; no images, volumes, networks, builds, installs or persistent-resource mutation. This is not project-bundle minitest6.0.6 evidence. Sanitized receipt: be03-r24-contract-docker.json; full logs/source archive remain fleet reports/cassian-r24-contract. SPEC-BE03-C11 final156LOC repaired-test re-review0newdefects closes residual fixture pin. All four unique review findings now statically closed. Source review and contract checks do not establish SQL/API/UI/generator or BE03 completion.
