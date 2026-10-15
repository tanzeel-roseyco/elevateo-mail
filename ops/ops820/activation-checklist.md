# OPS-820 activation checklist — all gates open

This is an operator template, not approval or execution evidence. Root owns activation. No live credentials, DNS, Hetzner, SMTP, provider enrollment, or production data are used by OPS-820.

- [ ] Source SHA, migration lineage and independent functional/design reviews accepted by root.
- [ ] Every deployable image/client has pinned digest, reproducible build provenance, SBOM hash, signing identity and signature verification receipt.
- [ ] Redacted configuration diff is approved; private secrets are separately provisioned; send API is disabled and outbound hold is active at startup.
- [ ] Fresh task-owned test backup includes PostgreSQL, globals, private objects and task-owned credentials; manifest hashes and exact source identity recorded.
- [ ] Fresh source verifies the complete reversible migration tail from 20261013000008 through 20261015000014 before applying attachments; restored latest schema verifies the complete tail from 20261015000017 and requires attachment rollback refusal, with unchanged app schema/data fingerprints in both stages, DB/object markers, role privileges/FORCE RLS and exact resource cleanup.
- [ ] Authenticated authorized, denied cross-tenant, anonymous and revoked-principal HTTP/RLS probes pass against restored application services.
- [ ] API `/health` and `/ready`, held worker heartbeat, queue drain, and no-live-send control are observed.
- [ ] Restricted attachment gateway login has no membership or direct table/Auth privilege; its dedicated schema exposes only the complete session and mailbox-authorized helper, with revocation probes passing.
- [ ] Real private ClamAV reports clean for the harmless fixture and malware for exact EICAR bytes; pending, failed and malware objects remain unavailable to download.
- [ ] Synthetic twelve-person roster stays unbound: null email/Auth IDs, no mailbox grants or account enrollment, `live_activation=false`.
- [ ] Encrypted off-host backup, retention, recovery objectives, capacity, monitoring and incident ownership are measured and approved.
- [ ] Native macOS/Windows signed install and actual-client checks pass; public TLS, DNS and any provider activation receive separate explicit approval.
- [ ] Rollback artifact and schema compatibility are checked; external provider acceptance ledger and held dispatch epoch survive any isolated restore; uncertain sends are reconciled without a second submit.
- [ ] Root signs the exact release receipt and separately authorizes deployment and any later live sending.

Any missing receipt keeps release and outbound activation blocked.
