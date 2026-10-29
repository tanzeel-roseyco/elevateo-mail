# BE02 bounded write-input repair

Frozen snapshot: 2026-10-13; task `task_d5972c05066b`, dispatch `ctx_9a6612c977bb`.
Application runtime, lint, typecheck and all authored tests: **NOT_RUN** by worker instruction.
Root owns fleet-02 Docker execution and independent review. No agents, commits, frontend,
SQL, SessionWrites, WriteResponse or contract edits were performed.

## Repairs

1. WT-01: JSON decimal/exponent tokens now use the already locked BigDecimal 4.1.3 through
   pinned JSON 3.0.2 `decimal_class`. Fractions remain exact until semantic integer validation;
   bounds precede integer conversion. Integral decimal/exponent forms remain accepted.
   Underflow exceptions are scoped and restored, preventing enormous negative exponents
   silently becoming zero. Nonfinite values, Unicode rejection and nesting limits remain.
   Explicit `allow_duplicate_key: false` preserves duplicate rejection with JSON 3's post-parse
   object-class conversion, including escaped equivalent keys.
2. WB-T01: ShortStream now uses StringIO bounded byte reads. Tests establish a split four-byte
   scalar, exact cap, cap-plus-one rejection and valid split JSON parsing.
3. WB-T02: Existing controller cases were retained; the DELETE success fixture now actually
   dispatches DELETE. Added absent/zero/understated Content-Length success at the actual byte
   cap and overflow failures, DELETE body:false rejection and nonidentity encoding rejection.
   Failure checks cover the closed error envelope, no Auth calls, no store calls, no SQL,
   no transaction/business activity and no operation invocation. Fractional versions also
   pass through controller parsing to post-authority field validation and rollback.
4. F1: Valid serialized objects assert exact 4096/4097 byte lengths, commit versus rollback,
   and plain versus escaped/multibyte content. Malformed fixtures remain separate.

Defects addressed in authored changes: **4 assigned findings**. Runtime-confirmed fixes: **0**.
Changed-file review surface: **815 physical lines**; assigned-finding density **4.91/KLOC**.
The explicit duplicate-key parser option is a preservation correction within WT-01, not a
separately counted reviewed finding. No claim of independent adversarial review is made.

## Exact changed paths and SHA-256

| Path | Physical lines | SHA-256 |
|---|---:|---|
| apps/server/lib/elevateo/write_input.rb | 133 | 87AA266B2C9F54EB921E57581009970081B3DC82A0B6EC8D9049F27317985F76 |
| apps/server/sig/write_input.rbs | 25 | 1A84A2E6F5234BD25940E03F0CBEC5AD5E62304838722B2A1D37DB085193E407 |
| apps/server/test/be_02/write_boundary_input_test.rb | 131 | 2045B4EC9C18B6AC32BD4239CE1F44C258FE738B8C698329F0845AC47B26BF94 |
| apps/server/test/be_02/write_boundary_test_helper.rb | 108 | A1AA65F7B0B0F2FB35849F9A014136C1766CE6FA468470847944574112D57C31 |
| apps/server/test/be_02/write_boundary_controller_test.rb | 228 | 5FAB279E90DEE5D1F7ABE14DE953B2AC88F1EC555DBD8C7068EFDCBF42B73F2D |
| apps/server/sig/write_controller.rbs | 14 | D5260BA349986A7F68130F6A922EF92D7633BF347DA8D4FDFBAA34A153178C67 |
| apps/server/sig/drafts.rbs | 51 | 4724F723DE1408E5E4B9D19042C16B7E1D20D35A91B2735948699B1F9FA28FF3 |
| apps/server/sig/mailbox_memberships.rbs | 36 | B9DFD77F75CF6F8125DD8C26B7D321358E05BB7328EEFD6CFA55B1F0833D8B63 |
| apps/server/sig/thread_collaboration.rbs | 27 | 370C3D368E11D3F3BC35A4683BEC848E1F648886CCEB3EB8E4E4C11EB17E5E39 |
| apps/server/sig/thread_assignment.rbs | 21 | 9C6ACF27D2466B05373BB39D9269796051B425BEA7A59EDF9392309A387B273E |
| apps/server/sig/thread_notes.rbs | 27 | DE00BDC099D6217EF980950A922F8A9C9E4E80110879F2BE61AA4A640E158274 |
| apps/server/sig/thread_read_state.rbs | 14 | A69490AE704238566C1E7B0DAD5566D8327B3AC2216E78D4B608399C45EDACFE |

This report is the thirteenth changed path, `docs/completion/be02-write-input-repair.md`;
its hash is supplied in the completion message to avoid self-referential hashing.

## Review manifest for root

Each assignment below is a separate pass of at most 200 physical LOC; each reviewer receives
at most 400 total physical LOC. These are proposed assignments, not completed reviews.

| Reviewer | Pass | Path and inclusive lines | LOC | Focus |
|---|---|---|---:|---|
| Input reviewer | 1 | write_input.rb 1-133; write_input.rbs 1-25 | 158 | Exact token conversion, bounds, duplicate/nesting/Unicode behavior, signatures |
| Input reviewer | 2 | write_boundary_input_test.rb 1-131 | 131 | Actual parser regressions, byte-faithful IO |
| Caller reviewer | 1 | write_boundary_test_helper.rb 1-108 | 108 | Real Rack dispatch, absent Content-Length, rollback model |
| Caller reviewer | 2 | write_boundary_controller_test.rb 1-114 | 114 | Transport ordering, DELETE, Auth and mutation exclusion |
| Caller reviewer | 3 | write_boundary_controller_test.rb 115-228 | 114 | Semantic versions, response cap, commit/rollback and envelopes |
| Design reviewer | 1 | write_input.rb 1-133; write_input.rbs 1-25 | 158 | Exact decimal representation and consumer normalization tradeoff |
| Signature reviewer | 1 | Seven additional sig files listed above, each 1 through its full line count | 190 | Write-only input aliases; preserve session/read types |

Actual consumer compatibility review (unchanged runtime files, each range starts at line 1;
prefix controllers with `apps/server/app/controllers/v1/`, others with `apps/server/lib/elevateo/`):

| Reviewer | Pass | Files and final lines | LOC | Rationale |
|---|---|---|---:|---|
| Draft consumer reviewer | 1 | write_controller.rb 48; drafts_controller.rb 42; drafts/payload.rb 48 | 138 | Parsed input, callback typing, nested recipient narrowing and integer normalization |
| Membership consumer reviewer | 1 | mailbox_members_controller.rb 47; mailbox_membership_input.rb 35; mailbox_memberships.rb 97 | 179 | Guard callable, capabilities narrowing and version persistence |
| Thread consumer reviewer | 1 | thread_assignments_controller.rb 32; thread_assignment.rb 80; thread_collaboration.rb 71 | 183 | Shared keys validation accepts write bodies and existing string query values |
| Thread consumer reviewer | 2 | thread_notes_controller.rb 34; thread_notes.rb 100; thread_read_states_controller.rb 20 | 154 | Notes/read-state dispatch receives the write alias |
| Read-state consumer reviewer | 1 | thread_read_state.rb 50 | 50 | Boolean normalization before persistence |

Paths in the manifest resolve to the full changed paths above. Root should give reviewers
the frozen C/D contract and the three coordinator review reports as contextual documents.

## Primary evidence and remaining handoff

Official pinned source inspected read-only:

- [JSON 3.0.2 parser](https://github.com/ruby/json/blob/v3.0.2/ext/json/ext/parser/parser.c):
  decimal_class converts the original number token; allow_duplicate_key is a parser option.
- [JSON 3.0.2 common API](https://github.com/ruby/json/blob/v3.0.2/lib/json/common.rb):
  object_class conversion occurs after parsing; it cannot alone detect overwritten duplicates.
- [BigDecimal 4.1.3 implementation and API documentation](https://github.com/ruby/bigdecimal/blob/v4.1.3/ext/bigdecimal/bigdecimal.c):
  string conversion, EXCEPTION_UNDERFLOW and save_exception_mode restoration.

No parser dependency was added. Gemfile.lock lines 80 and 109 pin BigDecimal 4.1.3 and JSON 3.0.2.
`WriteInput::value` and `WriteInput::object` now describe exact decimal values. Consumers
must validate through WriteInput.integer before persistence or response serialization; no
business response schema changed. Existing Auth aliases should not be globally broadened.

Coordinator message `msg_dec580d26ccd` authorized dependent signature-only edits in response
to escalation `msg_0a8f6dccb94b`. Completed those edits for WriteController callbacks, Drafts
payload/addresses, membership input/capabilities and writes, thread validators/write methods,
and shared keys validation. Session/identity and response projection types remain unchanged.
Root must run typechecks and the affected Docker suites, including actual draft callers;
BigDecimal RBS availability and parser exception behavior remain runtime verification gates.
The controller probe verifies inherited caller dispatch, not route recognition or PostgreSQL
semantics. No runtime success, production readiness or completed design review is claimed.
