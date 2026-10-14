# Rowan BE03-SQL R24 evidence

Status: isolated S1/S2 implementation IN PROGRESS; BE02 OPEN, integration/release gated. Baseline03ae770; branch delivery/rowan-r24. Actual worker is native Codex; effective Fast billing unverified. No live transport/network driver, credentials, paid paths, R&D or activation.

Source: migration20261013000007_create_send_intents.rb; db/be03_send SQL; ops/db/bootstrap-send.sql plus additive bootstrap role-graph allowance; test/sends SQL regression harness. Existing migrations00001..00006 and save-draft bytes remain unchanged. Canonical contract is contracts/v1/openapi.json; dispatch typo corrected in incoming packet.

Implementation: author/compose/approve_send scope before replay; cookie-bound protected-write metadata via narrow session bridge; session/generation -> policy -> operation -> shared draft locks; independent exact snapshot bytes/digest comparison; same/different-key replay/convergence; semantic conflicts persist; epoch required only for first approval; one queued intent/job/approved audit consumes draft without incrementing version. Private tables use forced owner-only RLS; API receives only scoped review/approval/status; worker receives no send capability in this slice. Down refuses durable history.

Tests prepared: atomic counts, saved operation replay after consumption, same/distinct-key races, changed binding, stale snapshot/policy, conflict, unavailable epoch, suppression/disabled policy, capability revocation before replay, forged GUC rejection, rollback, actual-role grants/RLS, immutable snapshot/audit, parent deletion, deferred completeness, refused down. Tests NOT_RUN until Soren schedules fleet Docker on immutable reviewed source. No Docker resources created by Rowan; no cleanup commands run.

Outstanding: independent bounded source and design reviews, Docker SQL/regression/type/lint results, integrated actual API/UI acceptance; S3-S5 worker SQL intentionally deferred behind tested S1/S2. Root owns acceptance.

Self-review corrections before runtime: bootstrap role list accidentally repeated the new role, which could issue two CREATE ROLE statements on an empty installation; removed duplicate. Consumed-draft guard now permits legacy ON DELETE SET NULL clearing of reply_to_thread_id while immutable intent retains approved reply context. Neither change is runtime-verified yet. Independent defect density remains pending; self-findings are separate.

Integration-seam repair: timestamp JSON projection now follows C/D fixed UTC microsecond Z spelling; default PostgreSQL timestamptz JSON used +00:00 and would fail Nadia strict projection. Actual projection assertions added; runtime NOT_RUN.

## Independent source review receipts

SPEC-BE03SQL01 reviewed27c74c6 persistence/authority320LOC in154/166 packets:0actionable defects,0/KLOC. SPEC-BE03SQL02 reviewed27c74c6 plus9bcbd57 projection196LOC in131/65packets:1MEDIUM post-business-lock expiry bypass on replay/convergence,5.10/KLOC. SPEC-BE03SQL03 reviewed27c74c6 regressions/bootstrap297changedLOC in174/123packets:1MEDIUM existing distinct-key concurrency exercised only already-approved intent,3.37/KLOC. Aggregate functional coverage813unique reviewed source/changedLOC,2defects,2.46/KLOC (context excluded). SPEC-BE03SQL04 dedicated design9bcbd57360LOC in154/131/75packets:0new defects,0/KLOC; existing expiry finding nonadditive. Full INT-401 rubric applied.

Repairs: fresh narrow session guard after all business waits before any ledger disclosure/replay/convergence; existing+distinct-key expiry-during-draft-wait regression. Fresh editable-draft distinct-key concurrent approval now uses two live cookie sessions and deterministic observed database blocking before first transaction commits, with exact one intent/job/audit and two operations. Awaiting independent repair re-review and actual Docker. No runtime PASS. Cassian receives this record for central code-reviews integration.

Repair re-reviewae90c13: SPEC02 220LOC reread,26unique changedLOC0new defects; expiry defect source-repaired. SPEC03 220LOC reread,56changedLOC0new defects; fresh distinct-key initial-race defect source-repaired. Re-read overlap is nonadditive. Runtime closure pending.

Fleet lightweight actualae90c13 at2026-10-14T10:51:56..10:51:58UTC: mounted immutable archive+canonical Gemfile.lock comparison, four Ruby syntax checks and affected RuboCop lint4files0offenses, exit0. Task containerbe03-r24-rowan-light-ae90c13 --rm1CPU768MiB128PIDs/no-network/read-only10001; independent container absencePASS. No images/volumes created; shared dependency image retained for consumers under Soren. Sanitized receipt/log: incoming/rowan-r24-lightweight-ae90c13/receipt.json and checks.log (outside Git). This is not SQL runtime evidence.

Additional prepared DB evidence: injected failures after intent/job/audit/consumed draft/operation mutation, concurrent save-before-approve and approve-before-save with real observed blocker, and empty send-only down in rollback transaction. Existing draft schema destructive probe now downgrades empty newer send objects first, never suppressing assertions or changing old migrations. New additions await bounded review and Docker; no full acceptance claim.
