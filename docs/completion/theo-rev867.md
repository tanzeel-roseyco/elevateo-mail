# REV867 sequence controller source review

Exact candidate `251546499f6f3d72dcdcefeb08584f7607b6a97b` in `completion-cassian-int801`, including `578baa6` sequence activation and the later 16 KiB request cap. Reviewer: Theo, Orca task `task_144c8ff3862f` / dispatch `ctx_217956e662b5`; actual Codex runtime identity recorded in this session as `gpt-6-sol` (billing tier unverified). Source only; no app tests, Docker, live credentials, mail, or external operations.

## Exact bounded coverage

Every read was at most 107 source lines; **350 unique versioned source LOC** were inspected, exactly the task cap (below hard 400). Exact candidate Git blobs: controller `895caba146048f41fa5e3e90cbd17643f0965c43`, registry `35553440b69aa3a1b1ffc5a519190361acf1124a`, controller test `e2b020d325e88211dc732a55c73d6d94a9e1d350`, registry test `2dc60ac5fa394dd487ea55726abd2676067f8eb1`.

| Source at `2515464` | Lines | Unique LOC |
| --- | --- | ---: |
| `apps/server/app/controllers/v2/outreach/sequences_controller.rb` | 1–58 | 58 |
| `apps/server/config/v2_route_registry.rb` | 1–52 | 52 |
| `apps/server/test/outreach_sequence/controller_test.rb` | 1–107 | 107 |
| `apps/server/test/v2_route_registry_test.rb` | 1–85 | 85 |
| `apps/server/app/controllers/v2/outreach/base_controller.rb` | 9–25, 40–53 | 31 |
| `apps/server/lib/elevateo/outreach_sequence/repository.rb` | 25–34, 102, 110, 112 | 13 |
| `apps/server/lib/elevateo/campaigns/repository.rb` | 132–135 | 4 |

Original `578baa6` packet has 178 added/2 removed LOC in the four target files; later cap commit changes one controller line to `max_bytes: 16_384` (one added/one removed). Aggregate **182 changed LOC**, 0 confirmed defects (**0/KLOC**). One conditional finding below is not counted as confirmed defect or density. Other campaign repository behavior, domain SQL/RLS, scheduler, OpenAPI, web code, and full test suites were excluded by the source cap.

## Conditional finding sent immediately to Cassian and root

**Potential P2, unconfirmed: absent parent campaign may not become the intended uniform 404.** `SequencesController#update:32–35` calls `campaign_repository(...).detail(kind: "campaign", ...)` and ignores the returned value, then saves. The controller test's fake `detail` always returns a campaign; it does not cover `nil`/forbidden parent. If the real `Campaigns::Repository#detail` returns nil for absent or forbidden, the sequence save can proceed until SQL foreign-key/RLS failure and surface a server error instead of `not_available`. The review cap precluded inspecting the rest of that method. Cassian should confirm nil/raise semantics and add an absent/forbidden parent controller regression if needed. Do not treat this as a verified defect before that check.

## Rubric and limits

The route registry adds only GET/PUT sequence draft and keeps worker job inactive. `protected_read`/`protected_write` provide current session, tenant, CSRF, bounded JSON and write proof; the controller uses route UUID and rejects body/route campaign mismatch. `DraftInput` rejects non-draft status, and the controller maps reschedule conflict to the existing public conflict vocabulary. The 16 KiB transport cap matches the response budget; max Unicode/oversize behavior is not directly proven by the reviewed controller test. Repository source sampled shows transactional session-digest authorization, advisory locking and operation-ID replay lookup, but the remainder of replay/RLS implementation was excluded; no send or enrollment endpoint is added here. Source test coverage includes happy GET/create and two invalid input cases plus absent read; it omits absent write, stale version/replay, CSRF failure, max-byte/Unicode edges and actual-role DB assertions. These remain fleet regression requirements, not source-verified behavior. Names, comments and small controller methods are proportionate; no hot-path repeated query or duplicated domain algorithm was confirmed in the reviewed lines. Owner documentation exists in the commit history; no runtime PASS is claimed for this SHA.
