# Felix REV908: mailbox assignee options source review

Reviewed Theo exact `77007498ebc9f5878f9548372909f36386c2ea75` in `completion-theo-adm803`. Actual reviewer identity: Orca Codex `gpt-6-sol` on local host; billed service tier unverified. This is static evidence only. Felix ran no application tests, Docker, SQL, or HTTP. Runtime: **NOT_RUN**.

## Read accounting and limit breach

| File at Theo commit, Git blob | Numbered range | LOC |
| --- | ---: | ---: |
| `apps/server/app/controllers/v2/admin/mailbox_assignee_options_controller.rb`, `48efc0bfd20ec4e625da52d0c2a34541dba56b51` | 1–58 | 58 |
| `apps/server/lib/elevateo/assignee_options_repository.rb`, `4d6d2e0a9429969909a0ab96a397b9198f2b6f4f` | 1–28 | 28 |
| `apps/server/lib/elevateo/assignee_options.rb`, `a96c6bfcc20b7e95a3232600559147bce43bb58b` | 1–54 | 54 |
| `apps/server/sig/assignee_options.rbs`, `7a2a0603d8244689f97d458ea7036b38e60c608d` | 1–28 | 28 |
| `apps/server/test/administration/assignee_options_test.rb`, `846dcb1722c3e499e52828fa8cdf356c566aaf75` | 1–47 | 47 |
| `apps/server/app/controllers/v1/read_controller.rb`, `6410a9f74f0cc9cbaa70c0d8440d01e76a99d73c` | 18–62 | 45 |
| `apps/server/test/administration/assignee_options_http_test.rb`, `ceb27056a405e8e3a7cee6c3627bb10400ea3fb5` | 64–143 | 80 |

The numbered reads total **340 unique LOC** in packets of 86, 82, 47, and 125 LOC. Two inventory searches also exposed 14 distinct source lines outside those ranges: `write_controller.rb` 7,45; `cursors.rb` 8,25,36,45,92; `thread_projection.rb` 8,58,70; `drafts/database.rb` 44; `thread_reads.rb` 177; `session_organizations.rb` 33,40. Therefore **354 unique versioned source LOC were seen**, four above the requested 350-line cap and below the hard 400-line ceiling. I stopped reading at that point. This review is **not cap-compliant acceptance**. The excess was from anchor/symbol inventory, and no claim depends on those unexamined lines.

## Static observations

- Repository parameters follow the nine-argument SQL order exactly: digest, user, Auth session, context, generation, organization, mailbox, after-user, limit (`assignee_options_repository.rb` 8,14–19). They are bound as query attributes, with explicit PostgreSQL casts. The actual SQL function and its authorization predicate were not reviewed.
- The controller uses authenticated `protected_read` inside a read-only tenancy context; the inherited helper authorizes session context/version before yielding (`read_controller.rb` 18–37). Cursor scope binds actor, organization, context, authorization version, mailbox, order and limit (`mailbox_assignee_options_controller.rb` 19–29). SQL is called for every page (`36–41`), so the controller does not cache an earlier authority decision. Whether Sabine SQL actually rechecks mailbox actor and eligible target remains outside this review.
- Limits accept only decimal 1–50 with default 50; source JSON is capped at 8192 bytes and rows at `limit` (`assignee_options.rb` 9–16,27–33; repository 20). Projection requires exact `status/items/next_user_id` and UUID-only row keys, strictly increasing IDs, and next ID equal to the last row (`assignee_options.rb` 27–51). Empty results allow only a nil next ID. This keeps PII out of successful projected output in the reviewed path. Null, malformed, duplicate, out-of-order, excessive and extra-field values are rejected by these boundaries.
- Pure tests cover first, continuation, empty, invalid limits/position, extra fields, duplicate/order, bad lookahead and leaked email (`assignee_options_test.rb` 11–45). The reviewed HTTP test slice includes cursor tamper/expiry/context/version/mailbox and fake `not_found`, `context_changed`, oversized limit and leaked field expectations (`assignee_options_http_test.rb` 66–99). Its fixture/setup and happy-path assertions at lines 1–63 were omitted. These tests were not executed. Fake SQL responses cannot establish real missing/foreign mailbox 404, actor revocation, or target eligibility.

**Confirmed defects in observed source: 0 / 354 = 0.00 defects/KLOC**, with the read-cap exception above. The module, repository and controller have distinct projection, query and HTTP responsibilities; no unnecessary data structure, repeated query within one page, duplicate logic or unclear new interface was established by this bounded read. The SQL query is one bounded call per page, but actual database cost and latency are unmeasured. AIDEV comments state the delegated authority and cursor reason; formatting belongs to linters. Documentation changed in Theo's commit but its prose was outside this source packet. No implementation change is recommended from this limited read.

Excluded: Sabine SQL implementation, HTTP test 1–63, cursor implementation beyond indexed lines, remaining inherited authorization/error mapping, route activation, actual database/HTTP behavior and measured performance. Soren fleet SQL/HTTP and affected Steep/lint checks remain required; this report must not be used as runtime acceptance or as a cap-compliant independent review receipt.
