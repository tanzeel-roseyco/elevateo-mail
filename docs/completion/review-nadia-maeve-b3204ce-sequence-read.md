# MAC814 independent review: sequence read and protected writes

Pinned source: Maeve `b3204ce2ed862f415a774a5c8eb34344808caba9` in `/home/tanzeel/orca/workspaces/integration/completion-maeve-mac814`. This is static source review only. No Docker, application test, database fixture, build, live mail or paid action was run. Actual authoring identity: Codex GPT-6; requested Low/Fast billing is not verified.

## Exact coverage and limit

| Source | Versioned lines inspected | Unique LOC |
| --- | --- | ---: |
| `apps/server/db/migrate/20261013000016_create_outreach_sequences.rb` | 65–121 | 57 |
| `apps/server/lib/elevateo/outreach_sequence/repository.rb` | 1–161 (in bounded snippets) | 161 |
| `apps/server/test/outreach_sequence/repository_test.rb` | 1–15, 106–136 | 46 |
| `apps/server/lib/elevateo/outreach_sequence/schedule.rb` | 19–65 | 47 |
| `apps/server/sig/outreach_sequence/schedule.rbs` | 1–22 | 22 |
| `apps/server/sig/outreach_sequence/tzinfo.rbs` | 1–17 | 17 |
| **Total** | Four bounded read calls, largest 114 lines | **350** |

The 350 unique versioned LOC review cap is exhausted. Uncovered: migration 1–64 and 122–129; repository test 16–105; schedule 1–18 and 66–109; draft input, current auth helpers, Dorian 00009, real role bootstrap, controller, and documentation contents. Dorian 00009 is separately owned and was not read. The commit stat shows README/state/documentation changes, but their contents were not reviewed.

## Finding

**MEDIUM — actual-role RLS proof missing (test evidence defect).** Migration 88–118 gives SELECT a `content_read` policy and INSERT/UPDATE/DELETE distinct `draft_write` policies. Repository `fetch` 52–80 calls the read authorizer and returns `nil` for absent or unauthorized rows; `save` 25–48 invokes the write authorizer. The new tests at 112–134 use an in-memory `Connection` and inspect recorded SQL. They cannot establish that `elevateo_app_read` can read with content-read only, is denied with revoked/cross-organization actor context, and cannot mutate without current draft-write authority. Add task-owned disposable PostgreSQL tests using actual API/app-read roles and current session context: reader-only GET positive plus write denial; writer-only mutation positive as policy intends plus unauthorized read denial; revoked/cross-org GET and INSERT/UPDATE/DELETE denial; absent and forbidden both return nil. Include an attempted UPDATE of a previously visible row after grant revocation, and verify no row/occurrence mutation on denial. Soren alone should run them in fleet-02 Docker. No concrete bypass is proven from these slices.

**Conditional integration risk, not counted as a defect:** `replace_locked` 96–100 reads the sequence `FOR UPDATE`, which may require both SELECT and UPDATE RLS. If content-read and draft-write capabilities are intentionally independent, a write-only editor could be filtered before the protected update. Prove the intended capability relation with real roles or adjust the write path after policy review; do not widen RLS from static inference alone.

## Rubric and limits

The read path validates UUID and 64-hex digest, uses an organization and campaign filter, orders steps, and yields nil for missing/forbidden in the fake test. Write code validates input and digest, serializes by campaign, checks operation replay and version, and applies guarded UPDATE/DELETE/INSERT; no unbounded nested loop or obvious hot-path repeated query was seen in the inspected methods. Boundary limits for step counts and full schema constraints are outside coverage. Schedule 19–65 validates time, timezone and maximum delay and treats ambiguous/nonexistent DST as held; all five schedule RBS method arguments are `untyped`, reducing static boundary proof despite runtime guards, but no functional failure is established here. Tests include a fake happy GET and absent/forbidden GET, plus prior write-denial assertion at 106–109; real grant, mutation denial and current actor behavior remain unproven. Comments at migration 85 and repository 51 explain policy intent; names and method size are clear in reviewed lines. No unauthorized side effect, data structure breakage or performance defect was established in these bounded slices.

Confirmed finding count: **1 test evidence defect / 350 reviewed LOC = 2.86 findings per 1,000 LOC**. Confirmed production defects: **0 in reviewed lines**, which is not a runtime pass. Independent design/runtime acceptance and real database role proof remain open.
