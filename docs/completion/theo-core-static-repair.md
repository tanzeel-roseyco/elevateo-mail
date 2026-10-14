# Theo core static repair — QA815 `fa3082afad80`

Soren's [fleet static receipt](</home/tanzeel/orca/workspaces/integration/completion-soren-qa815/docs/completion/qa815-evidence/ruby-static-fa3082afad80.txt>) reports ADM-803 Steep errors in roster, grants and audit source, plus one roster test RuboCop offense. This repair is source-only; neither Theo nor this report claims a rerun.

| Error site | Deliberate correction |
| --- | --- |
| `administration_roster.rb` 11, 29, 38 | RBS types fixed identity rows as arrays of `String?` while runtime still checks all twelve exact tuples; default path uses nonnullable `__FILE__`; empty grants require an actual empty array. |
| `organization_grants_controller.rb` 31, 55, 84, 87, 149 | Cursor UUID is checked as String before regexp; SQL `next_user_id` is narrowed after matching the projected last row before signing; previous page ID is explicitly optional String; write guard accepts and validates both required keywords. |
| `organization_role_audit_controller.rb` 21, 23, 42 | Empty filters have a typed closed value; cursor ID is checked as String before regexp; SQL next ID is narrowed before signing. |
| `roster_test.rb` 15 | Parentheses make the Minitest assertion block association explicit. |

Review packet proposed to root: A `administration_roster.rb` lines 1–80, `administration_roster.rbs` lines 1–17 and `roster_test.rb` lines 1–30 (127 LOC); B `organization_grants_controller.rb` lines 20–95 and 140–159 (95 LOC); C `organization_role_audit_controller.rb` lines 10–57 (48 LOC). **270 unique source LOC**, each file read bounded; the complete diff is the repair under review. These are proposed coverage ranges, not a completed independent review. Verify signed malformed cursor denial, page ordering/next cursor, actor authority, unchanged twelve unbound identities and no extra role writes. Design tradeoff: use runtime boundary narrowing for SQL JSON and cursor positions rather than widening `Cursors::position` to arbitrary JSON values. Soren alone runs Steep and affected RuboCop in fleet Docker on the integrated exact SHA; other owners own unrelated static errors in the same receipt.
