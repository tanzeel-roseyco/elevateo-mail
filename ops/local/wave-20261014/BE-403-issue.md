Owner: Rowan
Ticket: BE-403
Branch: `fix/rowan-schema-auth`

Repair R3 failure creating app_drafts_private with least privilege. Cover real session lifecycle, tenant isolation, mailbox reads and durable draft behavior with container regressions.

Observed failure is permission denied for database postgres during CREATE SCHEMA, not a confirmed existing-schema ACL problem. Coordinate acceptance with QA and infrastructure.

Acceptance: reviewed changes, relevant container tests on fleet-02, synchronized project and Obsidian documentation, exact evidence and unresolved issues. No public release before required automated and visual gates.