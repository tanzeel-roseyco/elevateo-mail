# QA-817 bounded static review: Nadia attachment SQL and private ports

Reviewed exact Nadia commit `7b86da7f76a7fa2d2230447595a583e1c56edd4d` in `completion-nadia-send810` on 2026-10-14. This is static source analysis only. Felix ran no application test, Docker, Storage request, migration, or benchmark.

## Exact source coverage

| File | Lines | Unique LOC | SHA-256 |
| --- | ---: | ---: | --- |
| `apps/server/db/migrate/20261015000015_create_inbox_attachments.rb` | 1–140 | 140 | `cafff9a4b92f9c89f9e69b8c19ec79d974388eae7eac5a1336decf44dee3ce0c` |
| `apps/server/lib/elevateo/attachments_repository.rb` | 1–58 | 58 | `7d042bc09335e6acd4890723049d82dd91a9d8f64d9c845cc381ccef1ef984f2` |
| `apps/server/lib/elevateo/attachments_scan.rb` | 1–36 | 36 | `680b5e4c31bfb4136f4a88b79db29ac9e225b285eede7f8cbbb07bd4172dd9f0` |
| `apps/server/lib/elevateo/attachments_storage.rb` | 1–107 | 107 | `b27f6031430c136708767009c701a69a46fb591af354b31e90d4c033be4fff6e` |

Reads were 140, 94, and 107 lines, each below 180. Total **341 unique versioned source LOC** of 350 allowed. Three confirmed static defects: **8.80 defects/1,000 reviewed LOC**. Excluded by cap: `attachments.rb` 1–90, `service_test.rb` 1–96, `send_intents_controller.rb`, Corin's ingest caller, Storage server implementation, and prior schema/migrations. Documentation diff was read separately as non-source context; test behavior remains unverified.

## Defects

1. **HIGH — FORCE RLS blocks the migration's own definer path.** Migration lines 37–40 force RLS and create only a SELECT policy for `elevateo_app_read`. The subsequent `SECURITY DEFINER` functions are intended to run as `elevateo_owner`, yet no owner SELECT, INSERT, or UPDATE policy exists. `stage_inbox_attachment` INSERT (60–62), `bind_imported_inbox_attachment` SELECT/INSERT (88–105), pending lookup (115–116), and verdict UPDATE (124–125) cannot operate under that owner unless an unshown BYPASSRLS privilege overrides FORCE RLS. Corin independently identified missing owner INSERT/SELECT; this review adds the verdict UPDATE path. **Fix:** add narrowly scoped policies for the actual function owner and prove them with disposable role-level PostgreSQL fixtures, including denied direct API/worker writes. Runtime is pending.

2. **MEDIUM — internal object paths are readable by the app read role.** Migration lines 47–48 grant `storage_key` in `elevateo_app_read`'s SELECT column list; repository `find` returns it at lines 21–26. For imported objects the key includes source account UUID, UID validity, UID and ordinal. This is an internal private-bucket locator, and the same migration otherwise restricts scanner metadata to a worker function (111–133). The app read role can query that locator for every row its policy permits; the current `page` projection does omit it, so HTTP leakage is **not** proven. **Fix:** remove `storage_key` from the app read grant and ordinary find projection; use an owner/worker-only lookup for the restricted byte gateway. Verify exact role grants and safe HTTP DTO on fleet.

3. **MEDIUM — concurrent first import is not idempotent.** Migration lines 88–105 perform `SELECT ... FOR UPDATE`, compare an existing tuple, then INSERT. The unique index at lines 33–34 protects `(source_account_id, source_uidvalidity, source_uid, source_ordinal)`, but two concurrent transactions can both observe no row before either INSERT; the second then fails with `23505` instead of comparing the committed row and returning its ID. The current comparison handles sequential retry only. **Fix:** insert with conflict handling, then lock/select and compare all immutable fields, or catch unique violation and run the same comparison. Test concurrent identical and conflicting tuple attempts in disposable PostgreSQL.

## Other rubric checks and limits

The schema couples attachment rows to message tenant/mailbox/thread via a composite FK, caps filename and byte size, fixes MIME/status/rejection vocabulary, and uses a unique imported tuple. Definers set an explicit `pg_catalog, app` search path and revoke direct worker/API execution of the ingest binder. The scanner verifies byte length and SHA-256 before accepting only `clean` or `malware`; its default refuses to fabricate a verdict. The Storage adapter constrains host, port, bucket, token length, process kind, keys, timeout, retry count and response size; it checks `public=false` before each object operation. These are source observations, not runtime proof.

The binder checks worker session identity and tuple shape but does not itself prove that `p_account` belongs to `p_org`/`p_box`; Corin's not-yet-integrated definer caller must establish that binding. Repository `page` accepts an unbounded `limit` parameter, while Nadia's documentation proposes a 1–50 API cap; the caller/route was outside this packet, so exposure and query cost remain unproved. The added unit test file exists (96 lines) but was excluded by the source cap; coverage of these three defects is not established. The feature remains an incomplete seam by Nadia's documentation: no real scanner, gateway route, Corin bind integration, or fleet run. No latency or memory budget is measured.

**Soren request:** on exact integrated SHA, run disposable owner/API/worker RLS fixtures, successful stage and scan transition, denied direct writes, concurrent same/conflicting tuple retries, private-path role/DTO checks, and the authored unit suite; report actual timings, role identities, cleanup, and failures. No live Storage or mail interaction.
