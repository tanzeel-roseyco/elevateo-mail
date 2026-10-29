# Project state

Status: frontend prototype exists on feature/frontend-prototype; backend and desktop are planned, not implemented.

## Repository
- Local: C:\Users\Tanzeel\Code and projects\Elevateo Mail
- Private GitHub: https://github.com/tanzeel-roseyco/elevateo-mail
- Product and repository branding renamed. Existing mailroom:* browser-storage keys are preserved to avoid losing prototype data.

## Completed
- Added requested web and macOS scope alongside Windows. Proposed direct `.exe`/`.dmg` distribution and one shared backend; initial local CLI AI is desktop-only. Distribution PDF addendum records signing costs and native release checks. No installers, downloads site or production web app has been built or published.
- Distribution PDF verification: both pages rendered and visually inspected; text and six clickable source links checked. No application source changed or Docker testing required for this document-only update.
- Reader edition: output/pdf/elevateo-mail-master-plan.pdf (10 pages), plus frontend and system-design PNGs in output/imagegen/. Rendered and visually inspected all PDF pages; text, page count and output links checked. Latest correction: Hunter/AMF supply optional enrichment, AI handles personalisation. This artifact-only change did not rerun application tests or use Docker.
- Approved frontend standards and interactive browser prototype: inbox, compose, campaigns, contacts, activity, settings and search.
- Six initial research assignments (three Codex, three actual Claude CLI sessions), followed by ten connection/efficiency assignments; reports and synthesis in docs/research/2026-10-04/.
- The ten follow-up assignments ran in waves because the environment permits three concurrent child agents; ten simultaneous agents were not available.
- Product master plan, backend blueprint, efficiency plan, connection/provider/MCP/DNS contracts and draft backend standards.
- Scoped branding review: 168 lines, six changed lines, zero confirmed defects. Four planning findings incorporated into the synthesis or retained as explicit launch decisions.
- Historical frontend review: 57 defects found, 56 fixed, one deferred. Fresh Docker validation on 2026-10-04: lint/typecheck/build passed; 101 unit/component tests and 27 browser tests passed, with one intentional mobile skip. Desktop/mobile branding visually inspected. See docs/validation/2026-10-04.md for evidence and cleanup.

## Confirmed pilot
Ten completely separate users, up to ten mailboxes each (100 total). Maximum 30 outgoing emails per connected mailbox per day: effective maximum 300/user/day and 3,000 total/day. The earlier 600/user/day figure is an expansion scenario, not a pilot allowance.

Existing Google inboxes from separate organisations/personal Gmail; Resend for eligible opted-in campaigns; staged self-hosted support. Users bring their own provider keys and local Codex/Claude accounts. AI can read selected mailboxes and draft by default; sending is separately enabled and approved. Approved campaigns run in the cloud when the PC is off.

Private Connections can manage explicitly approved subdomains through a narrowly authorised broker. Preserve company root MX and existing inbound consumers. No DNS or provider credentials were changed. Hunter and AMF provide optional enrichment; AI performs personalisation. Exact AMF product/API identification remains open.

Hosting target: under A$15/month, excluding mailbox/provider/AI subscriptions, external verification and signing. Proposed 50 GB cloud file allowance and history/import limits remain subject to review; cost examples are conditional.

## Approval and launch decisions
- Backend/desktop standards in .planning/BACKEND-STANDARDS.md are drafted, not approved. No backend execution.
- Review master plan sections individually: rolling 24-hour/per-recipient quota semantics; history, imports and storage; authentication/MFA and regions; one named self-hosted adapter and AMF identity; Google external OAuth and AI data-policy compliance; independent backup/key recovery and outage alerts.
- Frontend STANDARDS section 3 private-helper amendment still needs confirmation.
- Dependency maintenance: three moderate development-tool audit entries share one Vitest advisory. No production dependency entry was reported; upgrade and revalidation remain outstanding.
- Deferred prototype review finding: some mutations bypass MailroomGateway. Route them through the API seam with pending/error/conflict handling during backend integration.

## Next implementation sequence, after approval
1. Authentication and two-user isolation; one real Gmail connection and incremental sync.
2. Durable sending ledger, quota reservation, consent/suppression, recovery and cloud scheduling.
3. Resend and a named self-hosted adapter; controlled history imports.
4. Windows shell and restricted local AI bridge; Connections permissions.
5. Scoped DNS changes only after record-level authorisation is proven; restore/load/security/Windows launch checks.

Read output/pdf/elevateo-mail-master-plan.pdf for the reader edition, then docs/backend-blueprint.md for implementation detail. docs/product-master-plan.md remains the editable planning source. Research reports are evidence; older capacity scenarios do not override the pilot above.
