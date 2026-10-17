# BE02 completed-repair independent review index

<!-- AIDEV-NOTE: Root owns integration and runtime acceptance; this index records bounded read-only reviewer evidence. -->

Status: frozen queue and coverage-index preparation COMPLETE under root instruction msg_e6a1e2176396. Parent task task_5ca99abe0ad6 / dispatch ctx_a6d6f2a5112b. Review coordination run run_0aea8ea31d1f created no reviewer workers; reviewer dispatches belong to root run run_5cc7ae2ab900. Static reviews and runtime checks are NOT_RUN by this task. No source edits occurred.

Root extensions msg_51db31947f4f and msg_9f317e801fac add the completed write-race and numeric-input packets. Unfinished Auth RLS and deadline/guard repairs remain excluded. Orca refused the first nested worker launch with `nested_worker_depth_exceeded`, max depth1 and effectsApplied=false; no worker was created. No native-agent substitution or settings change occurred.

Root confirmed receipt and successful parsing of all 22 assignments in msg_e6a1e2176396, narrowed this task to preparation, and assumed all dispatches, monitoring, release, findings, acceptance and fleet testing. Root will schedule bounded waves because the device had 1.25 GiB free; that latest instruction supersedes the frozen queue's earlier whole-wave scheduling note. Models in the map are requested identities only; this task executed no reviewer model.

Final freeze verification checked all 46 source files and seven repair manifests: 53 SHA-256 comparisons matched, source physical line counts matched, and no drift was found. Review findings and historical closure remain unassessed.

## Dispatch and coverage map

The seven frozen repair packets contain **3474 unique changed physical source lines across34 files**. Additional unchanged consumer compatibility coverage contributes **604 unique lines across12 files** after deduplicating thread_notes.rb. Total production/test/signature coverage allocated: **4078 unique physical lines across46 files**. The proposed compaction SQL recipe adds **66 lines** separately. All coordinator metadata checks matched the frozen hashes; actual review coverage is pending.

Every pass <=200 physical lines and each fresh reviewer <=400 unique lines including helper/context. Assignment totals sum to5946 lines including intentional overlap and the recipe; this is not the defect-density denominator. Formatting belongs to lint, NOT_RUN. Only each reviewer's unique report is writable.

Machine-readable launch queue: [review-be02-repair-launch-queue.json](review-be02-repair-launch-queue.json), SHA256 `3208105a2e4c0dea365e29a4a9c9405f4101bb61f211a1580148e18d3c712197`. Root must omit model/effort flags when null and request gpt-6-astra/max for the three designated design reviewers. Requested identities are not execution evidence.

| Assignment/report suffix | Unique LOC | Bounded passes | Requested identity | Actual dispatch/model/state |
| --- | ---: | --- | --- | --- |
| draft-boundaries | 280 | draft_payload_test.rb:1-83; draft_reads_test.rb:1-121 + draft_database_test_helper.rb:1-76 | authenticated Codex default | NOT_RUN — ROOT_PENDING |
| draft-authorization | 340 | draft_authorization_test.rb:1-131; draft_database_test.rb:1-133; draft_database_test_helper.rb:1-76 | authenticated Codex default | NOT_RUN — ROOT_PENDING |
| draft-races | 233 | draft_concurrency_test.rb:1-157; draft_database_test_helper.rb:1-76 | authenticated Codex default | NOT_RUN — ROOT_PENDING |
| membership-races | 337 | mailbox_membership_concurrency_test.rb:1-148; mailbox_membership_database_helper.rb:1-189 | authenticated Codex default | NOT_RUN — ROOT_PENDING |
| membership-database | 330 | mailbox_membership_database_test.rb:1-141; mailbox_membership_database_helper.rb:1-189 | authenticated Codex default | NOT_RUN — ROOT_PENDING |
| collaboration-http | 207 | collaboration_controller_test.rb:1-115; collaboration_controller_helper.rb:1-92 | authenticated Codex default | NOT_RUN — ROOT_PENDING |
| collaboration-database | 383 | collaboration_database_test.rb:1-183; collaboration_database_helper.rb:1-200 | authenticated Codex default | NOT_RUN — ROOT_PENDING |
| collaboration-helper-races | 338 | collaboration_database_helper.rb:1-200; collaboration_database_helper.rb:201-221 + collaboration_concurrency_test.rb:1-117 | authenticated Codex default | NOT_RUN — ROOT_PENDING |
| collaboration-services | 280 | collaboration_services_test.rb:1-163; collaboration_concurrency_test.rb:1-117 | authenticated Codex default | NOT_RUN — ROOT_PENDING |
| cursor | 321 | thread_notes.rb:1-100 + mail_search.rb:1-39; mail_search_test.rb:1-88 + thread_notes_cursor_test.rb:1-94 | authenticated Codex default | NOT_RUN — ROOT_PENDING |
| compaction | 116 | operations.sql:1-50; be02-draft-compaction-repair.md:31-96 | authenticated Codex default | NOT_RUN — ROOT_PENDING |
| write-races | 218 | write_boundary_concurrency_test.rb:1-119; write_boundary_database_test_helper.rb:1-99 | authenticated Codex default | NOT_RUN — ROOT_PENDING |
| design-draft-membership | 370 | draft_concurrency_test.rb:1-157; mailbox_membership_concurrency_test.rb:1-80 + mailbox_membership_database_helper.rb:85-167; operations.sql:1-50 | gpt-6-astra / max | NOT_RUN — ROOT_PENDING |
| design-write-collaboration | 335 | write_boundary_concurrency_test.rb:1-119; write_boundary_database_test_helper.rb:1-99; collaboration_concurrency_test.rb:1-117 | gpt-6-astra / max | NOT_RUN — ROOT_PENDING |
| numeric-input | 289 | write_input.rb:1-133 + write_input.rbs:1-25; write_boundary_input_test.rb:1-131 | authenticated Codex default | NOT_RUN — ROOT_PENDING |
| numeric-controller | 336 | write_boundary_test_helper.rb:1-108; write_boundary_controller_test.rb:1-114; write_boundary_controller_test.rb:115-228 | authenticated Codex default | NOT_RUN — ROOT_PENDING |
| numeric-signatures | 190 | write_controller.rbs:1-14 + drafts.rbs:1-51 + mailbox_memberships.rbs:1-36 + thread_collaboration.rbs:1-27 + thread_assignment.rbs:1-21 + thread_notes.rbs:1-27 + thread_read_state.rbs:1-14 | authenticated Codex default | NOT_RUN — ROOT_PENDING |
| numeric-draft-consumer | 138 | write_controller.rb:1-48 + drafts_controller.rb:1-42 + payload.rb:1-48 | authenticated Codex default | NOT_RUN — ROOT_PENDING |
| numeric-membership-consumer | 179 | mailbox_members_controller.rb:1-47 + mailbox_membership_input.rb:1-35 + mailbox_memberships.rb:1-97 | authenticated Codex default | NOT_RUN — ROOT_PENDING |
| numeric-thread-consumer | 337 | thread_assignments_controller.rb:1-32 + thread_assignment.rb:1-80 + thread_collaboration.rb:1-71; thread_notes_controller.rb:1-34 + thread_notes.rb:1-100 + thread_read_states_controller.rb:1-20 | authenticated Codex default | NOT_RUN — ROOT_PENDING |
| numeric-read-state-consumer | 50 | thread_read_state.rb:1-50 | authenticated Codex default | NOT_RUN — ROOT_PENDING |
| design-numeric | 339 | write_input.rb:1-133 + write_input.rbs:1-25; write_controller.rb:1-48 + payload.rb:1-48 + mailbox_membership_input.rb:1-35; thread_read_state.rb:1-50 | gpt-6-astra / max | NOT_RUN — ROOT_PENDING |

## Frozen source manifest

Paths relative to C:/Users/Tanzeel/Code and projects/Elevateo Mail - BE02 Codex. Hashes below are initial metadata verification, not assertions of completed review.

| Path | Physical lines | SHA-256 |
| --- | ---: | --- |
| apps/server/test/be_02/draft_payload_test.rb | 83 | 2dd71fc87f9ab386f0a94afb6c3db88f0af92d23510d9f637d669097cfa7ad54 |
| apps/server/test/be_02/draft_reads_test.rb | 121 | 00acc66dc1cbba3e87d9d6b21a9709d146b3e2043359f7b592211e5d49d339b6 |
| apps/server/test/be_02/draft_database_test_helper.rb | 76 | 93f8e02b887400cc646719fe45a89ba147533a77c4d68e32c3f76cc9a1051e5e |
| apps/server/test/be_02/draft_authorization_test.rb | 131 | 22f7eef04a7f0aa577c4e7f35e8f3315e00d20a03f4aff05e275e664862b28d1 |
| apps/server/test/be_02/draft_database_test.rb | 133 | 015663b9a0b062db29f8a4ea4978a12320be0fa5e72e15ec8d2a9d09b2600656 |
| apps/server/test/be_02/draft_concurrency_test.rb | 157 | 58cceee542291b5f19bb280e590492c9e4ca5b0bd382d67accf73c904e48086d |
| apps/server/test/be_02/mailbox_membership_concurrency_test.rb | 148 | 65a3f5789e1330d1d837119e2280152c2f49c7c2bc5afa098c16fb7e05cc042f |
| apps/server/test/be_02/mailbox_membership_database_test.rb | 141 | f182cb092d31cd97fde022700fc7e6f6cd62e05f10aa9a8bf9bd42c23f958e8b |
| apps/server/test/be_02/mailbox_membership_database_helper.rb | 189 | b9e7c939c804f40ceb6302ece846c54544898ad1d216776e4dad452ab9c2be29 |
| apps/server/test/be_02/collaboration_controller_test.rb | 115 | 824133c3f2f731be0c92355b619bac89f65e78754394240a557b2c1276efc09d |
| apps/server/test/be_02/collaboration_controller_helper.rb | 92 | af4d2ce8e4dca289782f23d1ffc4f1d6e4d0e062c3c36ec3c9c604ee55c447e8 |
| apps/server/test/be_02/collaboration_database_test.rb | 183 | c45a685feda972497e8089ee016dd890c1abb8c9f5aebaa95ca193535755c8ba |
| apps/server/test/be_02/collaboration_database_helper.rb | 221 | ed14323962ffa2258addd7432928f8284ce74218ba8ed9e49001555eb3d50b58 |
| apps/server/test/be_02/collaboration_services_test.rb | 163 | 604ed91e2413ce1df23412822e2ce797d7b5e715723817be334e43c6b07831e1 |
| apps/server/test/be_02/collaboration_concurrency_test.rb | 117 | 0e4aa70031d8a82a4efeb9cb3ed229e64eabe9fa607ab6afe3bd3e5e805722aa |
| apps/server/test/be_02/mail_search_test.rb | 88 | e4a0988bbbef51e464577181427a71ddaa1676137306726b362c0a310787ee2b |
| apps/server/test/be_02/thread_notes_cursor_test.rb | 94 | 4b537a65b5624576d8330fc13737be864b92f2a7570ee44e86e17634d6229c75 |
| apps/server/lib/elevateo/thread_notes.rb | 100 | 161024d2d079bace051db792a30eb6a7b13f117238a72a302d478087432b3437 |
| apps/server/lib/elevateo/mail_search.rb | 39 | 59f4f97351468cf7aae61810dec2f724e374dace482e8c97177fd38ef9e45acc |
| apps/server/db/be02_drafts/operations.sql | 50 | 9b2999a43136a27432a12d72d60793e29ac4a7693fc2f7114ab9dfe43b11d4a1 |
| apps/server/test/be_02/write_boundary_concurrency_test.rb | 119 | 6013c99b6ae3808083c035dca6fd5d6167d92edb3687f41a2cf66dda27692b4a |
| apps/server/test/be_02/write_boundary_database_test_helper.rb | 99 | 708bdd3a4e0a14f93686ebf71ea7a8f73e259207a8b1c01a9375d4a55935011e |
| apps/server/lib/elevateo/write_input.rb | 133 | 87aa266b2c9f54eb921e57581009970081b3dc82a0b6ec8d9049f27317985f76 |
| apps/server/sig/write_input.rbs | 25 | 1a84a2e6f5234bd25940e03f0cbec5ad5e62304838722b2a1d37db085193e407 |
| apps/server/test/be_02/write_boundary_input_test.rb | 131 | 2045b4ec9c18b6ac32bd4239ce1f44c258fe738b8c698329f0845ac47b26bf94 |
| apps/server/test/be_02/write_boundary_test_helper.rb | 108 | a1aa65f7b0b0f2fb35849f9a014136c1766ce6fa468470847944574112d57c31 |
| apps/server/test/be_02/write_boundary_controller_test.rb | 228 | 5fab279e90dee5d1f7abe14de953b2ac88f1ec555dbd8c7068efdcbf42b73f2d |
| apps/server/sig/write_controller.rbs | 14 | d5260ba349986a7f68130f6a922ef92d7633bf347da8d4fdfbaa34a153178c67 |
| apps/server/sig/drafts.rbs | 51 | 4724f723de1408e5e4b9d19042c16b7e1d20d35a91b2735948699b1f9fa28ff3 |
| apps/server/sig/mailbox_memberships.rbs | 36 | b9dfd77f75cf6f8125dd8c26b7d321358e05bb7328eefd6cfa55b1f0833d8b63 |
| apps/server/sig/thread_collaboration.rbs | 27 | 370c3d368e11d3f3bc35a4683bec848e1f648886cceb3eb8e4e4c11eb17e5e39 |
| apps/server/sig/thread_assignment.rbs | 21 | 9c6acf27d2466b05373bb39d9269796051b425bea7a59edf9392309a387b273e |
| apps/server/sig/thread_notes.rbs | 27 | de00bdc099d6217ef980950a922f8a9c9e4e80110879f2be61aa4a640e158274 |
| apps/server/sig/thread_read_state.rbs | 14 | a69490ae704238566c1e7b0dad5566d8327b3ac2216e78d4b608399c45edacfe |
| apps/server/app/controllers/v1/write_controller.rb | 48 | a8755e7dfe2c279209d2fb5f242bec628c604a62a78c0c2a489e47ea1e7b6d10 |
| apps/server/app/controllers/v1/drafts_controller.rb | 42 | c73bd590b1c79939ca55a82e1aaea74ab1f20c81a7e24399f48840fb4edfecf0 |
| apps/server/lib/elevateo/drafts/payload.rb | 48 | 8aaf5b23dee01ba32e6f43aac299d366c7f62e8f2dbeec975a23994a9c5fc310 |
| apps/server/app/controllers/v1/mailbox_members_controller.rb | 47 | 00d878968c96197ddb8015f56c0385a740cea5798850e3166f4cba642851a51b |
| apps/server/lib/elevateo/mailbox_membership_input.rb | 35 | 5840d6c8e7227db458c3e81c30a4f47e9d152ffb33a9ce211c37251686389a7c |
| apps/server/lib/elevateo/mailbox_memberships.rb | 97 | 4e1f78b319c1cbeb713cb2e3d4d0b5dd79feec1f641ce037d0a2e504a4f54050 |
| apps/server/app/controllers/v1/thread_assignments_controller.rb | 32 | 436ea2f9db5aa639a6a2f985692aca571ca7b2f35e07ffbd26815b93b5319940 |
| apps/server/lib/elevateo/thread_assignment.rb | 80 | 9a99d0d2f11ddf7b26a9c530a2cc11294b325e133aea4e843573ab09202ab9c8 |
| apps/server/lib/elevateo/thread_collaboration.rb | 71 | c4abf9d245c4b1d82183166bad67ac0e6859d133f02ce23690f79282184283b0 |
| apps/server/app/controllers/v1/thread_notes_controller.rb | 34 | 96b56c8305a2393d31749d8e755f752803173580db98a7a748f3399765d0dca3 |
| apps/server/app/controllers/v1/thread_read_states_controller.rb | 20 | 00a915d7c7029bdc59a6cac079485707c7f82f9cb39de14f729e3c81493f4cb6 |
| apps/server/lib/elevateo/thread_read_state.rb | 50 | a05f3af1b6a163b2df8b11cf7b2b63758fa532543acc3c7543cd16d030f9e6c0 |

Compaction proposed probe: docs/completion/be02-draft-compaction-repair.md full-file SHA256 `79525e5e1bc0e5e7fc5a8ca43942a02fd69f10b6c94f02e0f7d8b1177c2e17ab`, source recipe31-96, full document103 lines. Recipe reviewed separately from50 production lines.

| Frozen repair manifest | SHA-256 |
| --- | --- |
| docs/completion/be02-draft-test-repair.md | 456ee9c6ca560c89d93538335eb493076bba40db1493ee6bd630a4eb7a777052 |
| docs/completion/be02-membership-test-repair.md | dc6a9569efe7cbd77809c19fe04066155a0cd4fa9f1480283bcb157e67f009eb |
| docs/completion/be02-collaboration-test-repair.md | 1f5941ebc9f86d376083632990755374bd2108f2cb9f8cf10d6f34fcac0ea58a |
| docs/completion/be02-cursor-repair.md | 944907fa3fe29873a4593626aa1058ff14773b4eb2990d7c382e842a966ab4e3 |
| docs/completion/be02-draft-compaction-repair.md | 79525e5e1bc0e5e7fc5a8ca43942a02fd69f10b6c94f02e0f7d8b1177c2e17ab |
| docs/completion/be02-write-races-repair.md | 98d28cc581bcff2a46812a3fdb3f27f315c3b33145b3966db016452633cff0fc |
| docs/completion/be02-write-input-repair.md | 4bcbc54bedebb276cee9d43f6b05d9e9e9a06f7bcc3beb5b77dd6f98a5280d43 |

## Requirements and pending evidence

All tasks carry the full required review rubric, read-only boundaries, hash gates, old-finding disposition, exact defects/density, and a request for prose interface summaries instead of unbounded source reads. Dedicated design reviewers use analytical schedules; Obsidian is unavailable and no simulation execution is claimed. No reviewer receives successive tasks under an exhausted allowance.

Runtime acceptance, mutation experiments, actual PostgreSQL wait observations, exact production nested plans in custom/generic modes, pinned parser/BigDecimal and typechecker execution, real server CONTENT_LENGTH behavior, HTTP/native/visual integration and execution-resource cleanup remain root-owned and NOT_RUN. Compaction missing behavior-test coverage is a gap to root, not authorization to change another owner's tests. Controller probe tests do not establish route recognition or PostgreSQL behavior.

## Findings, duplicate relationships and repair requests

Independent reports remain root-owned and NOT_RUN by this task. Observed residual defect count and density are not established; no zero-defect claim is made. Known overlapping historical cursor findings CS-01 and CD-DES-01 represent one defect. Authored assertion improvements must be distinguished from executed proof; runtime closure is not authorized. Root owns integration into code-reviews.md, fixes, commits and state checkpoints.


## Historical finding coverage ledger

These27 unique historical findings are mapped for closure assessment. This is a review checklist, not a claim that fixes work; every runtime disposition is NOT_RUN. Cursor CS-01/CD-DES-01 is one historical defect.

| Historical finding | Assigned report suffix | Closure invariant | Static disposition |
| --- | --- | --- | --- |
| draft DTB-01 | draft-races; draft-authorization | Actor/session and exact generation blocker, both serialization orders | PENDING |
| draft DTB-02 | draft-authorization | True cross-organization authority controls and no mutation | PENDING |
| draft DTB-03 | draft-boundaries | Valid recipient fixtures at100 and101 | PENDING |
| draft DTB-04 | draft-boundaries | Included item cursor differs from lookahead and timestamp tie | PENDING |
| draft DTB-05 | draft-boundaries; draft-authorization | Ordered recipients affect digest, neutral keys do not | PENDING |
| draft DTB-06 | draft-boundaries | Missing detail exact code/status/message | PENDING |
| draft DR-01 | draft-races; design-draft-membership | Exact blocker identity rather than unrelated lock wait | PENDING |
| draft DR-02 | draft-authorization | Observe stored lifetime instead of manufacturing it | PENDING |
| draft DR-03 | draft-authorization; compaction | Permanent digest/binding/timestamps preserved | PENDING |
| membership R1 | membership-races; design-draft-membership | Last-manager serialization with different valid versions | PENDING |
| membership R2 | membership-races; design-draft-membership | Reversed guard pairs, existing/missing guards | PENDING |
| membership R3 | membership-database; membership-races | Bounded PID publication, exception handoff, ordered cleanup | PENDING |
| collaboration CH-01 | collaboration-http | Valid JSON exactly at/over byte cap with no effects | PENDING |
| collaboration CDB-1 | collaboration-database; collaboration-helper-races | Admin fixture changes restricted to owned tenant rows | PENDING |
| collaboration CDB-2 | collaboration-database | Assert nullable fields exist; false unread distinguished from nil | PENDING |
| collaboration CDB-3 | collaboration-database | Accessible mismatched thread positive controls | PENDING |
| collaboration CDB-4 | collaboration-database | Specific author-spoof SQLSTATE instead of arbitrary PG error | PENDING |
| collaboration races R1 | collaboration-services | No-op state and timestamp equality plus limits | PENDING |
| collaboration races R2 | collaboration-services | Alphabetic UUIDs distinguish uppercase normalization | PENDING |
| cursor CS-01 = CD-DES-01 | cursor | Cursor size selects cursor_invalid; historical duplicate counted once | PENDING |
| search S-01 | cursor | Empty search cursor matches contract error and precedence | PENDING |
| compaction DTX-01 | compaction; design-draft-membership | One stable cutoff, exact nested plan probe pending runtime | PENDING |
| write-races F2 | write-races; design-write-collaboration | Transaction starts before expiry, actual blocker observed before DB clock crossing | PENDING |
| numeric WT-01 | numeric-input; numeric-controller; design-numeric; consumer reviews | Exact original numeric value; normalize only after semantic validation | PENDING |
| numeric WB-T01 | numeric-input | Short reads bounded by bytes and split UTF-8 | PENDING |
| numeric WB-T02 | numeric-controller | Caller cap/encoding/body rejection before mutation | PENDING |
| numeric F1 | numeric-controller | Valid response JSON cap/overflow distinguishes byte predicate | PENDING |
