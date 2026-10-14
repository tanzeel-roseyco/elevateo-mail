# REV-872 bounded independent source review

Target: Leonie `f8b07b2afe99549b66a454b37abc58c6d1e46597` in `completion-leonie-ops820`. Reviewer: Maeve, Codex `gpt-6-sol` (source review only). Tests and Docker: NOT_RUN by reviewer; Soren alone owns fleet-02 execution. No source owner files changed.

## Coverage and density

| Exact source | Reviewed lines | Scope |
| --- | ---: | --- |
| `ops/ops820/bootstrap-gateway.sql` at target SHA | 1–53 | privileged creation, owner/ACL validation before password rotation, limited role |
| `ops/ops820/gateway-bootstrap-smoke.sql` at target SHA | 1–27 | effective role, schema owner/ACL and database CREATE denial |
| `ops/ops820/gateway-helper-smoke.sql` at target SHA | 1–43 | post-migration helper owner, ACL and callable surface |
| `ops/ops820/gateway_negative_wrong_owner.sql` at target SHA | 1–3 | transaction-scoped owner mutation |
| `ops/ops820/restore-rehearsal.sh` at target SHA | 1–145 | restore ordering, negative fixtures, oracle and cleanup path |

Target source coverage: 271 unique LOC; zero confirmed defects in Leonie's changed source, **0 defects/KLOC**. The changed documentation hunk in `docs/completion/leonie.md` was also read. Dependency context: Sabine `f4bd412` migration `20261015000018_create_attachment_gateway_binding.rb` lines 1–84. Aggregate unique versioned code read was 355 LOC, five above the requested 350 ceiling but below the hard 400 ceiling; I stopped and did not review `restore-rehearsal.sh` after line 145 or other runners. Reads were each at most 180 LOC.

## Findings and limits

1. **Integration blocker, external to Leonie source:** visible Sabine `f4bd412` 00018 still executes `CREATE SCHEMA app_attachment_gateway AUTHORIZATION elevateo_owner` at line 30 while Leonie's bootstrap now creates that schema first. Without Sabine's consuming repair, the migration is expected to fail with duplicate schema. Its `down` at line 81 drops the schema; lifecycle ownership must be reconciled with the new bootstrap. Sent immediately to root, Sabine and Leonie. This is an inference from the two source revisions, not an observed SQL failure and not counted as a Leonie defect.
2. The bootstrap checks the effective restricted login, database CREATE denial, owner and limited schema ACL before password rotation in one transaction. A wrong owner raises before rotation. The restore fixture starts a transaction, changes owner, and expects the smoke to abort; connection closure should roll the change back. The script reruns the positive smoke afterward. These are static findings only; actual credential, rollback and privilege behavior need Soren's disposable PostgreSQL receipt.
3. Fixed role names and bounded catalog queries leave no new user input parsing or hot-path query concern in this patch. The patch adds no new class or domain abstraction. Existing source/restore runner behavior outside the reviewed lines remains uncovered.

Required fleet evidence: on an immutable integrated SHA containing the compatible Sabine 00018 repair, run privileged bootstrap twice against the named disposable database, prove no database CREATE for gateway/migrator, owner and ACL checks before and after migration, wrong-owner negative exit and rollback, and cleanup. Preserve the earlier migration failure and report exact outer Docker command, SQL exits, sanitized archive and independent absence. No release or runtime PASS follows from this review.
