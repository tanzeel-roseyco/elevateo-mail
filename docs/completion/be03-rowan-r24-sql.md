# Rowan BE03-SQL R24 evidence

Status: isolated S1/S2 implementation IN PROGRESS; BE02 OPEN, integration/release gated. Baseline03ae770; branch delivery/rowan-r24. Actual worker is native Codex; effective Fast billing unverified. No live transport/network driver, credentials, paid paths, R&D or activation.

Source: migration20261013000007_create_send_intents.rb; db/be03_send SQL; ops/db/bootstrap-send.sql plus additive bootstrap role-graph allowance; test/sends SQL regression harness. Existing migrations00001..00006 and save-draft bytes remain unchanged. Canonical contract is contracts/v1/openapi.json; dispatch typo corrected in incoming packet.

Implementation: author/compose/approve_send scope before replay; cookie-bound protected-write metadata via narrow session bridge; session/generation -> policy -> operation -> shared draft locks; independent exact snapshot bytes/digest comparison; same/different-key replay/convergence; semantic conflicts persist; epoch required only for first approval; one queued intent/job/approved audit consumes draft without incrementing version. Private tables use forced owner-only RLS; API receives only scoped review/approval/status; worker receives no send capability in this slice. Down refuses durable history.

Tests prepared: atomic counts, saved operation replay after consumption, same/distinct-key races, changed binding, stale snapshot/policy, conflict, unavailable epoch, suppression/disabled policy, capability revocation before replay, forged GUC rejection, rollback, actual-role grants/RLS, immutable snapshot/audit, parent deletion, deferred completeness, refused down. Tests NOT_RUN until Soren schedules fleet Docker on immutable reviewed source. No Docker resources created by Rowan; no cleanup commands run.

Outstanding: independent bounded source and design reviews, Docker SQL/regression/type/lint results, integrated actual API/UI acceptance; S3-S5 worker SQL intentionally deferred behind tested S1/S2. Root owns acceptance.

Self-review corrections before runtime: bootstrap role list accidentally repeated the new role, which could issue two CREATE ROLE statements on an empty installation; removed duplicate. Consumed-draft guard now permits legacy ON DELETE SET NULL clearing of reply_to_thread_id while immutable intent retains approved reply context. Neither change is runtime-verified yet. Independent defect density remains pending; self-findings are separate.

Integration-seam repair: timestamp JSON projection now follows C/D fixed UTC microsecond Z spelling; default PostgreSQL timestamptz JSON used +00:00 and would fail Nadia strict projection. Actual projection assertions added; runtime NOT_RUN.
