# QA-815 fleet test scheduler

Baseline: `bbf2353b254a05d48c2da7a508c143e6fba78691`. Soren alone holds `/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock` for Docker operations. `ops/tests/qa815/run-web-candidate.sh` archives an immutable commit, runs the maintained frontend Docker recipe, and removes only its named container, image, and temporary context. The pinned Node image and committed npm lockfile are the existing dependencies; no new package was added.

## Executed receipt

Mira FE-806 candidate `140218de421453e662b938e5afb3ef7a0b73eb6a` was archived from Git and built under the lock. Inside a `--network none` task-owned container, typecheck, lint, focused `InboxPage.test.tsx` (1 file, 17 tests), and production build passed, all exit 0. Log: `qa815-evidence/mira-140218de4214.txt`, SHA-256 `62a8d2d243831b52d8c4f4075ab42aa5126c85af388f84ad0e77c958fe2dd30d`. Exact task container count 0 and task image count 0 after cleanup. No database, volume, or persistent mount was used; shared images and previews were preserved.

## Queue and limits

Cassian INT-801, Theo ADM-803, Sabine SEC-802 and other owner outboxes contain test requests. Their source requires integrated contract/SQL reconciliation or separate exact-candidate scheduling; none is counted as passed here. Mira's isolated test does not establish integrated gateway behavior, browser acceptance, backend authorization, or native packaging. No live credentials, SMTP, DNS, spend, or deployment were used. Design simulation: a stale compose capability followed by a denied mailbox read must hide navigation, while the server must still reject a direct draft URL; this is an analytical case, not runtime evidence.

Soren authored the scheduler and receipt; independent adversarial and design-tradeoff reviews have not occurred. Review coverage: 0 lines independently reviewed; actionable defects and density are unclaimed pending root review scheduling.
