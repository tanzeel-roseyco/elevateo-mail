# ATT823 bounded review and fleet request

Candidate branch `completion-nadia-send810`; source SHA is the implementation commit reported in `nadia-outbox.md`. This packet is a review request, not a performed independent review or runtime receipt.

## Bounded source packets

- Functional/security packet A (<=188 LOC): `apps/server/lib/elevateo/attachments.rb` lines 1–90, `attachments_repository.rb` lines 1–58, and `attachments_scan.rb` lines 1–36. Check current authorization before list/download, tenant/message binding, status projection, scan digest/length proof, no false clean, and pagination boundaries.
- Security/data packet B (<=140 LOC): `apps/server/db/migrate/20261015000015_create_inbox_attachments.rb` lines 1–140. Check RLS effective roles, SECURITY DEFINER ownership/search path, direct API/worker grants, composite FK, imported-source replay, rejected metadata and populated rollback. A real role fixture is necessary; source review alone cannot establish definer behavior.
- Object and failure packet C (<=200 LOC): `attachments_storage.rb` lines 1–current end plus `test/attachments/service_test.rb` lines 1–remaining budget. Check private-bucket proof, token restriction, bounded HTTP, stable inbound retry and cleanup; report uncovered test lines if the packet reaches 200 LOC.
- SEND810 type repair is separate: `apps/server/app/controllers/v1/send_intents_controller.rb` lines 17–33. Verify the UUID return is used without changing V1 payload shape.

A dedicated design-tradeoff reviewer should compare (1) restricted internal gateway versus passing the Storage service key to Rails API, (2) durable stable pre-stage before IMAP cursor advance versus staging after import, and (3) no-scanner hold versus treating a simulated verdict as clean. The intended decisions are restricted gateway, pre-stage with same-transaction bind, and hold until a real scanner runs. Report defects and density from actual unique lines reviewed; no review is claimed here.

## Soren fleet-only requests

1. On a task-owned Docker project sourced from exact commit, run `docker compose -f ops/compose.be02-test.yaml run --rm --no-deps test bundle exec ruby -Itest test/attachments/service_test.rb` with Soren's vetted environment and source path. This suite is authored but **NOT_RUN**.
2. Run affected RuboCop and Steep inside the same fleet Docker lease, including Nadia's SEND810 cancellation boundary. Static acceptance is pending.
3. In a disposable PostgreSQL/Supabase stack, run migration 00015 under the real migrator, then exercise `elevateo_api`, `elevateo_worker`, and owner roles: viewer versus compose, foreign org/message, direct INSERT and verdict UPDATE denial, binder callable only from Corin's definer ingest, same-tuple replay and changed-digest failure, rejected row visibility, scanner verdict transition, populated rollback refusal, and independent cleanup. No such DB fixture or result exists yet.
4. Verify private Storage bucket remains `public=false`, unauthenticated/client tokens cannot read, worker token can stage/read, and a changed-byte inbound retry cannot overwrite committed bytes. Use only disposable task objects; do not touch persistent user data.

## Integration limits

Cassian's V2 proposal remains noncanonical and routes inactive. The Rails API has no Storage service key by design; a reviewed authorized byte gateway remains necessary. Corin's held IMAP worker does not yet call the attachment binder before cursor advance. No ClamAV container or scanner is configured, so every real attachment remains pending or rejected, never clean/downloadable. Outbound attachments remain unsupported pending Rowan's immutable review binding.
