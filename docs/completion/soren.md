# QA-815 fleet test scheduler

Baseline: `bbf2353b254a05d48c2da7a508c143e6fba78691`. Soren alone holds `/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock` for Docker operations. `ops/tests/qa815/run-web-candidate.sh` archives an immutable commit, runs the maintained frontend Docker recipe, and removes only its named container, image, and temporary context. The pinned Node image and committed npm lockfile are the existing dependencies; no new package was added.

## Executed receipt

Mira FE-806 candidate `140218de421453e662b938e5afb3ef7a0b73eb6a` was archived from Git and built under the lock. Inside a `--network none` task-owned container, typecheck, lint, focused `InboxPage.test.tsx` (1 file, 17 tests), and production build passed, all exit 0. Log: `qa815-evidence/mira-140218de4214.txt`, SHA-256 `62a8d2d243831b52d8c4f4075ab42aa5126c85af388f84ad0e77c958fe2dd30d`. Exact task container count 0 and task image count 0 after cleanup. No database, volume, or persistent mount was used; shared images and previews were preserved.

## Queue and limits

Cassian INT-801, Theo ADM-803, Sabine SEC-802 and other owner outboxes contain test requests. Their source requires integrated contract/SQL reconciliation or separate exact-candidate scheduling; none is counted as passed here. Mira's isolated test does not establish integrated gateway behavior, browser acceptance, backend authorization, or native packaging. No live credentials, SMTP, DNS, spend, or deployment were used. Design simulation: a stale compose capability followed by a denied mailbox read must hide navigation, while the server must still reject a direct draft URL; this is an analytical case, not runtime evidence.

Soren authored the scheduler and receipt; independent adversarial and design-tradeoff reviews have not occurred. Review coverage: 0 lines independently reviewed; actionable defects and density are unclaimed pending root review scheduling.

## Continuation queue checkpoint — 2026-10-14 14:30 UTC

All commands below ran on the fleet Docker daemon under the Soren lock, using exact Git archives. Task containers were `--rm` and independently absent; the backend runner also removed its named image, database volumes, network and builder, retaining shared bases. The backend source archive received only empty `apps/server/tmp` and `log` directories because Git omits them; no tracked source bytes changed. `ops/tests/qa815/run-web-candidate.sh` now caps web test containers at 2 GiB, 2 CPUs and 256 processes.

| Source | Executed checks and result |
| --- | --- |
| Mira `e31da546a3e24d130c3b9b0e271604492fc292e6` | Full web API check, lint, typecheck, 40 files/693 tests, build PASS. |
| Fable `dc1db826d73683be13e201c04908fa24d3377b97` | Full web API check, lint, typecheck, 42 files/692 tests, build PASS. |
| Cassian `696549b13cdc72f6216f266d7736e8b4301a7005` | V2 contract 3 errors from truncated JSON; superseded source, failure preserved. |
| Cassian `bbed59cd688a43a19723ddf43daaf76db3c23821` | V2 contract 3 runs/10 assertions and route registry 3/9 PASS. |
| Theo `769c42ff5fe8bffaf0a8b1be6c11b496293b2404` | Roster 4/14 and grants input 3/10 PASS. |
| Dorian `21536e5d06756b55ae4b08f1145fbaa9d6484ac8`, `383503e55b1d886cfb0dd5d6a1e538b3460cbdb3`, `b3438e437dd8977304d24192a0eb246b7876f30b` | Input units PASS; repository first failed missing ActiveRecord bootstrap, latest failed Ruby syntax at repository.rb:199; affected lint/Steep failed. Owner notified. |
| Elara `342d701dd0148fb1c9df0fec42027738d188b20c` | Worker executor 4/14 PASS; affected full RuboCop and Steep failed. |
| Corin `8101cf80a90cc691f4cbbe8f351ed7d8ae6fa915` | Fake ingress 4/20 PASS; affected full RuboCop and Steep failed. |
| Leonie `d445156009e961a91c00453392219826089ba8fa` | Snapshot verifier 4 tests PASS in Python Docker. Restore against a disposable DB NOT_RUN. |
| Maeve `b79095c5e57051b0a8b8e9fd82c728ae1eb2de9a` | macOS config validator plus 3 Python tests PASS in Docker; Mac compile/install NOT_RUN. |
| Tessa `302142c8380049803090f021246215c5a721822e` | Acceptance TypeScript compile and 73 unit tests PASS in Docker. Playwright `--list` exited 1 with sanitized framework error; no browser case ran. Original `QA816-*` IDs were inadmissible under reporter and shared schema; Tessa later changed to `SCN-QA-816-*`. Reporter runtime needs a new exact probe. |
| Celeste `152f95a808d03e2dd9eb7671fff58f0863d51c5e`, `c23cd2272936b0d7e5850b3682c96aa80a252a4e`, `a460c5a836832d80512a285b56de1a0cc188ae9e`, `fe96194b4c668f456f70cf853263e751cf46dc0b` | Full web Docker gates stopped at strict type or lint on each exact isolated source; latest test props still violate exact optional type. Owner notified. |
| Lyra `e73c0f24b97f81a8e7a0f9397dd8c318cc342cff` | Isolated web typecheck failed missing Cassian/Fable imports and unknown narrowing; integrated retest required. |
| Integrated `f787bbc1662ef1ae90bbb89b5c6087e76510dd23` | Web API check PASS, lint failed Shell test parse and V2 outreach gateway unused vars; no type/unit/build. Disposable real PostgreSQL/Auth runner reached `AddSendCancellation` migration and failed `permission denied for schema app` under `elevateo_send_owner`; all later DB suites, HTTP, worker and browser NOT_REACHED. Cleanup PASSED. Nadia and Cassian notified. |

The earlier integrated `b071c9326f519b3ec80f9bb934864fd2f3a65c35` backend job failed before Rails migration because the archived source omitted the empty `log` mountpoint under a read-only bind. The first setup attempt lacked the detailed log copy; the second retained `027-migrate.log` and proved the OCI mount cause. Both task cleanups passed. A later `34f76021f51aeef83ccbba2f6b6fd9726dd46aa2` job failed; its wrapper copied to the wrong path, so its exact cause is unclaimed. The f787 wrapper retained result, cleanup and sanitized migration output and removed the exact temporary archive after receipt verification.

Raw receipts are in `docs/completion/qa815-evidence/`. The task-owned Python image is `python@sha256:48a11b7ba705fd53bf15248d1f94d36c39549903c5d59edcfa2f3f84126e7b44` and Ruby dependency image is `sha256:7dc61d4b7e12f94764f95f4f1bfe8e3940049247e6d409898ce9d3ed2810f348`. No native APK, Tauri compile, Mox pilot, Supabase restore, real-browser screenshot or integrated acceptance is claimed. Current blockers are moving owner source and the documented integration failures; resource cleanup and source review remain separate evidence.
