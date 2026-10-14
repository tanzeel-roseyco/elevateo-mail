# QA-817 Felix candidate

Scope: adversarial security/performance regression coverage on the isolated `completion/felix-qa817` branch, based on `bbf2353b254a05d48c2da7a508c143e6fba78691`. Source: `apps/server/test/qa817/adversarial_boundaries_test.rb`. No production, contract, secret or deployment files changed.

The tests use existing `WriteInput`, `SendWorker::Control` and `SendWorker::SubmissionResult` interfaces. They require only existing Minitest and Ruby standard library dependencies. Happy path: exact origin, bounded literal plaintext, valid release control and simulated accepted evidence. Likely failures: origin/media spoofing, duplicate or illegal JSON, excess stream bytes, corrupt or oversized worker control, and forged/non-simulated result values.

Assumptions and limits: these pure boundary tests cannot establish cross-tenant reads/writes, organization escalation, stale database generations, CSRF token enforcement, worker locking races, secret absence across all outputs, or a measured hot-path budget. Those need authenticated HTTP/real PostgreSQL/fake transport fixtures owned by the relevant implementation teams and Docker execution by Soren. No benchmark number is claimed. Host application tests were not run.

Requested Soren command (fleet-02, under `/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock`): in the maintained disposable server test image with repository mounted at `/workspace`, run `cd /workspace/apps/server && bundle exec ruby test/qa817/adversarial_boundaries_test.rb`; Soren selects the exact authenticated Compose recipe and resource labels. Also request bounded authenticated HTTP/PostgreSQL cases for cross-tenant read/write, org escalation/personal content, stale generations and worker race; origin/CSRF; forbidden secrets and hostile IPC; and a timed bounded hot path with measured setup and limits. Exact command may need Soren's recipe adjustment; execution NOT_RUN.

Design tradeoff simulation for root (analytical, not executed): a pure input test catches malformed bytes quickly but cannot prove that SQL claims use the same tenant and generation as the request. A locked race fixture costs more setup yet is required to distinguish stale-generation rejection from an incidental 404. For performance, request count and query count are more stable initial oracles than a fabricated latency target; record latency only with fleet environment details.

Candidate SHA: pending commit. Review coverage: pending independent bounded review. Tests requested: above; tests executed: none. Limitations: no integrated acceptance or benchmark evidence.

## Continuation: actual database candidate

Added `apps/server/test/qa817/tenant_authority_database_test.rb` using `CollaborationDatabaseCase`: happy literal plaintext note under a real API role, foreign tenant read/write denial with exact admin witness unchanged, and private mailbox denial without explicit membership. This is not a simulation of a completed Docker run. Soren command from `/workspace/apps/server` in the maintained disposable backend test image: `bundle exec ruby test/qa817/tenant_authority_database_test.rb`; require `BE02_API_DATABASE_URL` and the existing disposable database fixture environment. Also run the boundary candidate and affected RuboCop/Steep. Exact image/project/cleanup belong to Soren.

SEC-802, SEND-809 and native IPC are absent from this baseline. Pending integrated tests: protected role ceiling and personal consent plus frozen legacy mutation bypass; revoked worker claim/authorize/record/cancel/unknown races; native IPC and callback denial. Coordinator was asked to relay exact owner seams. Performance evidence scan found PERF-01 design records explicitly unmeasured; a latency/memory budget cannot be defined from that source. Request Soren capture warm/cold latency, query count, peak RSS and environment on a frozen integrated build before setting thresholds.

Review request: independently review the new 44-line database test against full rubric in a <=200 LOC packet, plus dedicated design tradeoff review. Own source inspection is not independent coverage. No confirmed defect density claim. Tests executed: none.
