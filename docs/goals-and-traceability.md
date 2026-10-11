# Goals, scope and traceability

This is the acceptance map for Elevateo Mail. User-selected requirements, implementation proposals, imported evidence and working software are different states. The source intake is complete; the application remains a proposed implementation. Every dossier maps its contributions to these same identifiers.

## Product goal

Build an understandable, reliable shared company mailbox for about ten people. The web app and downloadable Mac/Windows clients use the same permissions and history. Claude and Codex can help with authorized search and drafting. Resend transports permitted email; self-hosted Supabase stores application data and identities. The system should use modest infrastructure and have a recovery path its operators understand.

“Institutional grade” means demonstrated access isolation, traceable changes, recoverable side effects, safe content handling, repeatable deployment and restore evidence. It is not a claim conferred by an interface, test count, imported repository or single-server specification.

## Requirements and proof

| ID | User goal / status | Design and source contribution | Measurable acceptance |
| --- | --- | --- | --- |
| R01 | Shared company mailbox for about 10 people — requested | Company/mailbox memberships; Wu workspace concepts; Quickly/lightreach inbox behavior | Two users collaborate; another mailbox's messages, snippets, files and audit data remain inaccessible |
| R02 | Resend — selected | New provider adapter; Instantly SDK injection/error patterns only | Controlled send/reply; signature and replay tests; provider acceptance distinct from delivery; unknown outcomes reconciled |
| R03 | Self-hosted Supabase — selected | PostgreSQL/Auth/private Storage; new scoped schema and migrations | Real restricted-role RLS tests, versioned upgrades, private object downloads and coordinated restore |
| R04 | Web application on a subdomain — requested | Shared React interface, authenticated Node API, TLS reverse proxy | Real HTTPS browser flow, invite-only login, safe message rendering, CSRF/origin tests and responsive UI |
| R05 | Mac and Windows downloads — requested | Proposed Tauri shell around accepted UI | Signed/notarized DMG and signed Windows installer, clean-machine install/login/update/rollback evidence |
| R06 | Claude and Codex connectors — requested | Proposed MCP bridge; lightreach registration ideas with replaced authority model | Both clients can search/read/draft only permitted content; expired/revoked grants denied; no initial send tool |
| R07 | Efficient compute and resourcefulness — requested | One modular backend plus worker; PostgreSQL jobs; no unnecessary brokers/mail servers | Pilot measures RAM/CPU/disk, queue age, provider quotas and attachment scanning; operator/cost budget accepted |
| R08 | Learn backend/system/database/CAP — requested | [Worked tutorial](backend-database-tutorial.md), failure matrices and actual upstream failure examples | Reader can explain tables/keys/RLS, transaction versus network effect, retry uncertainty and partition behavior |
| R09 | Use Codex CLI and update repository — requested | CLI-authored tutorial plus CLI review/tests of import tools; Git publication | Versioned repository update with verified remote commit and usable documentation |
| R10 | Upload all source or select best components; document strictly — explicitly authorized now | Six pinned source trees, full file manifests, six dossiers, adoption matrix and preserved notices | 2,764 exact included files; one documented sample-key omission; six original-tree checks; all dossier source links resolve |

## State of the work

| Area | Current status | What remains |
| --- | --- | --- |
| Upstream source | Imported reference collection | No claim that every source line has been reviewed |
| Provenance | Repository/commit and per-file hashes recorded | Reverify after any future refresh; retain license notices |
| Audits | Earlier findings/tests preserved and independently organized | Reassess changes selected for actual product use |
| Source tooling | Importer/verifier plus isolated fixture tests | Tools do not install, run or certify upstream applications |
| New product | Requirements and design documented | No Elevateo API/UI/worker/schema/connector/installer implemented yet |
| Application standards | Pending explicit approval under existing instructions | Source intake authorization does not silently approve all proposed product choices |
| Production operations | Design only | Domain/provider setup, measured capacity, owner, backup and restore validation |

## Non-negotiable correctness rules

- Authorization is company **and mailbox** scoped and checked server-side. Session/grant revocation must invalidate new calls even when an old JWT has not expired.
- Drafts use optimistic versions. Sending freezes a reviewed version, recipients and attachments. The approval, job and audit record commit together.
- Two clients cannot send the same approved revision twice by choosing different request IDs. Database uniqueness and stable provider identity enforce the logical-send boundary.
- A provider timeout can mean the email was accepted. Keep an explicit unknown state, reuse the same immutable request only within the safe retry horizon, and hold unresolved work afterward.
- Incoming events are verified and durably recorded before acknowledgment. Provider-scoped receipts and separate mailbox routes handle multi-address delivery without leaking private content.
- Content is hostile until processed: isolated/sanitized HTML, remote content blocked by default, private attachment quarantine and bounded resource use.
- A restored database starts behind an outbound hold. Reconcile provider effects before releasing old jobs; restore time must not reset a send's retry clock.
- Connector results remain untrusted email data. Tool authority comes from scoped grants, never instructions inside messages.

## Resource and ownership model

One continuously running backend serves all staff; installing a desktop client does not provision another database or mail server. The database is the durable queue initially. Worker concurrency and quotas are controlled at provider/account and ingestion boundaries; a noisy receiving domain cannot consume unbounded disk or scanning capacity.

A VPS is a recommended pilot option, not an already purchased deployment. The complete Supabase stack, object storage, malware scanning and backups need measured headroom. A single VPS remains one failure domain. Railway is a cost/operating-effort comparison, not a substitute for owning self-hosted database maintenance. Provider pricing and policy references remain in [the hosting guide](mail-delivery-and-hosting.md).

Suggested responsibility roles, not assigned people: product owner resolves mail purposes/domain/migration; security owner reviews access/retention; implementation owner delivers schema/API/UI/worker; operator owns upgrades/monitoring/restore; release owner handles signing and installer distribution. For ten staff, one person may hold several roles, but none may be left implicit.

## Decisions still required before deployment

Confirm actual addresses and aliases, existing MX provider, history/synchronization needs, sending purposes and peaks, attachment limits, region/data handling, retention, budget, maintenance ownership and recovery objectives. These do not block archiving source or drafting designs; they do block safe DNS migration, sizing guarantees and primary-company-mailbox release.

Follow [the milestone plan](implementation-plan.md), [component adoption](component-adoption.md) and [the standards](../.planning/STANDARDS.md). Do not equate the completed source upload with a working combined application.
