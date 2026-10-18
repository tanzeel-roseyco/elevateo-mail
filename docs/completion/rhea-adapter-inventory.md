# MAIL-818 app-to-Mox adapter inventory

Read-only source inspection on 2026-10-14 of Cassian combined checkout
`/home/tanzeel/orca/workspaces/integration/completion-cassian-int801`, commit
`1829ef425007e50a0f629d260cb43a3671f1e6e3`. This is a source inventory,
not an integrated runtime acceptance result. Cassian's branch can advance; use
the commit above when comparing paths and lines. Rhea's isolated pilot remains
at `ops/mail/mox-pilot/` in the separate `completion-rhea-mail818` branch.

| Capability | Current source | Finding |
| --- | --- | --- |
| Chosen product transport | `docs/mail-delivery-and-hosting.md:3-17` | Resend is the user-selected design, but no Resend runtime adapter is active in this combined source. Mox remains private R&D. |
| Local SMTP catcher | `compose.yaml:19-21,96-101,158-166`; `apps/server/lib/elevateo/config.rb:12-15,42,49,92-99,111-113` | Mailpit `mailpit:1025` is the only allowed SMTP setting, used by local Auth. Outbound hold must equal `true`; provider settings are rejected. An SMTP setting is not evidence that app sends through SMTP. |
| App send submit | `apps/server/bin/send-worker:10-39`; `lib/elevateo/send_worker/executor.rb:20-52`; `lib/elevateo/send_worker/durable_local_driver.rb:17-44` | Worker uses `DurableLocalDriver` and its fsynced synthetic ledger. `submit` never opens SMTP/HTTP; it returns simulated accepted, rejected or unknown. `SubmissionResult` permits only `local:` receipts/codes (`submission_result.rb:8-33`). There is no Mox/Resend submit adapter. |
| Retry and unknown | `lib/elevateo/send_worker/executor.rb:27-62`; `database_store.rb:68-112`; `db/be03_send/worker_authority.sql:152-205,271-319` | SQL fences an authorized attempt, records ambiguous outcomes as unknown and schedules reconciliation. The current driver can find exact prior simulated acceptance by attempt/digest; no Mox queue observation exists. Missing evidence cannot authorize automatic SMTP replay. |
| Inbound receive | `lib/elevateo/inbound/fake_ingress.rb:18-46`; `lib/elevateo/inbound/postgres_store.rb:9-57`; `db/migrate/20261015000011_create_isolated_inbound.rb:5-31,94-119` | Corin's fake, bounded MIME path has atomic dedup by organization/mailbox/provider/account/event and provider fixed to `fake`. No IMAP client, UIDVALIDITY/UID cursor, Mox account mapping, or Mox listener exists. `app/controllers/v2/fake_inbound_controller.rb:9-34` is test-profile gated; it is absent from `config/routes.rb` at this commit. |
| Provider credential reference | `lib/elevateo/config.rb:21,46-53,111-113`; `db/migrate/20261015000011_create_isolated_inbound.rb:5-26` | DB role passwords and Auth session credentials exist, but no mail-provider secret reference, version, rotation or revocation record is present. `provider_account_id` identifies a fake account; it is not a secret or authorization token. |
| Revocation | `lib/elevateo/send_worker/executor.rb:29-41`; `lib/elevateo/config.rb:92-99`; `app/controllers/v2/fake_inbound_controller.rb:12-27` | Existing hold/epoch/SQL grant/cancellation checks protect simulated sends; fake inbound uses a protected user session and mailbox check. There is no provider credential revoke that would fence a Mox connection or IMAP cursor. |

## Smallest next isolated slice for root

1. Ask Cassian and Elara to version an **inactive protocol adapter contract** at
   the send-worker seam: immutable bounded MIME/envelope input plus send ID,
   attempt ID, account ID and deadline; output accepted/rejected/unknown with
   opaque queue evidence. Keep the current simulated result type distinct.
   A connection loss after SMTP DATA is `unknown`; neither Message-ID nor a
   repeated attempt is proof of provider idempotency. Elara owns executor
   wiring and final SQL fence, so Rhea would implement only the isolated
   adapter behind that approved interface.
2. Ask Corin for a separate worker-authorized inbound interface that accepts
   a verified account mapping and IMAP `(UIDVALIDITY, UID)` evidence, then
   commits a deduplicated event before cursor advance. The existing fake
   user-session ingress must remain fake and must not be repurposed as a
   background IMAP authority. Corin owns migrations and the ingest transaction.
3. Keep a server-only **synthetic credential reference** in the isolated test
   profile with explicit account/version/revoked state; never put a password
   in a DTO, browser bundle, log or ordinary DB row. A revoked/version-changed
   reference must stop new submit/sync claims. Actual secret storage and live
   provider activation need a separate approved design.
4. Request one Soren fleet Docker job on exact reviewed source: Mailpit SMTP
   accept, 4xx, 5xx, post-DATA connection loss to unknown, no replay after
   ambiguity; Mox localserve authenticated submission/IMAP receive, wrong
   password, UID cursor restart, changed UIDVALIDITY and duplicate event;
   revoked reference denial, no external egress, resource receipt and exact
   task-owned cleanup. Use `.test` envelopes and fake credentials only.

This is a proposal, not a Mox production integration or a new API. It does not
alter BE02/BE03 contracts, Corin ingress, Elara worker, DNS, live credentials,
public listeners or the existing outbound hold. The separate pilot has no
fleet protocol receipt yet and remains queued behind application acceptance.
