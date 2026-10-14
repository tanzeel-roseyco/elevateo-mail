# Felix REV885: gateway schema rollback repair

Static review of Sabine `33ff06b6e1e9729828f4a6354946974d481985c5` and relevant Leonie integration `fbdaa8143e39fd84299aeb733e48b770d8cfdaee`. Reviewer runtime identity: Orca Codex `gpt-6-sol`. This review did not run application tests or Docker; fleet runtime remains with Soren.

## Bounded coverage

| Source commit | File, blob | Lines | LOC |
| --- | --- | ---: | ---: |
| Sabine `33ff06b6` | `apps/server/db/migrate/20261015000018_create_attachment_gateway_binding.rb`, `ea7061a287836a0951e6e6887a9a46ad81ff786b` | 1–95 | 95 |
| Sabine `33ff06b6` | `apps/server/test/attachment_gateway/migration_acl_test.rb`, `1b0c71d8321058c78d08b6742232b57fc7af57c8` | 1–72 | 72 |
| Leonie `fbdaa81` | `ops/ops820/bootstrap-gateway.sql`, `8f606c576751554e7f6b7c34e3fed342ebdfbef6` | 1–53 | 53 |
| Leonie `fbdaa81` | `ops/ops820/gateway-down-smoke.sql`, `b3ecf959fff69de448a326d3741b5492a34a5bf4` | 1–12 | 12 |
| Leonie `fbdaa81` | `ops/ops820/full-runner.sh`, `cf5296d7da59e4278b77d63f59d1b3b1f97926ab` | 45–71 | 27 |

Total: **259 unique versioned source LOC**, read in packets of 148 and 111 LOC (each below 180). The source runner outside lines 45–71, other migrations, DB helpers, and production gateway code were excluded; conclusions are limited to these lines. No source owner file was edited.

## Result and evidence

**REV881 schema USAGE rollback finding: statically closed.** Migration down removes the helper under `elevateo_owner` and explicitly revokes `USAGE ON SCHEMA app_attachment_gateway FROM elevateo_attachment_gateway` before restoring the session owner for the Auth EXECUTE revoke (migration lines 87–94). The bootstrap owns that schema and restricted login, and migration down does not drop either (bootstrap lines 1–53). This preserves bootstrap ownership while removing the grant introduced by migration up (line 81).

The new DB regression asserts bootstrap-only owner/login-adjacent ACL state, no gateway USAGE/CREATE, no helper, and no owner Auth EXECUTE after down; it asserts the narrow USAGE/helper/Auth state after up. It runs down/up/down/up in a rollback transaction and compares final state with its initial snapshot (test lines 1–72). The Leonie full runner invokes a post-down smoke query (runner lines 45–71), which checks owner/login retention, absence of the gateway grant/helper, and revoked Auth EXECUTE (smoke lines 1–12). These are useful positive and failure oracles, including repeated migration behavior. Actual migrator role privileges, transactional DDL behavior, and real DB outcomes are **NOT_RUN** by Felix.

Rubric check within coverage: migration operations are bounded DDL without data loops or hot-path queries; explicit actor changes and ACL checks preserve the intended authorization boundary. Empty or maximum payloads and external input validation do not apply to this SQL privilege repair; the test uses an environment DB name guard and session user guard before the transaction. The patch adds one focused DB test rather than a new abstraction. Names and comments express the privilege lifecycle. No new confirmed state, duplication, complexity, documentation, or performance defect emerged in this packet. Formatting is delegated to linters. Surrounding integration and runtime remain unverified here.

**Confirmed new defects: 0 / 259 LOC = 0.00 defects/KLOC.** Prior REV881 finding is closed by source evidence only. Soren's fleet Docker DB test and restricted-login smoke must establish runtime acceptance; no benchmark or latency claim is made.
