# Product and design context

## Confirmed direction
The user wants a Gmail-style interface with inbox, composer, campaigns, search, and settings for outreach to consenting / opted-in recipients. They want understandable architecture documentation that also guides an implementation agent.

## Assumptions requiring confirmation
"18 emails" is provisionally interpreted as 18 connected mailboxes. Single-user operation is not confirmed. Frontend sketches are visual references, not implementation instructions.

## Proposed architecture
A modular backend API and worker share domain logic. PostgreSQL stores durable application records. Redis is optional. Choose either application-owned campaign execution or provider-owned execution; never let both independently schedule the same follow-up. Validate provider APIs against required inbox and reply functionality before selection.

## Candidate services
Instantly or Smartlead for campaign execution; Resend for application notifications and only policy-compatible sending; EmailGuard for diagnostics; Hunter for address verification. These are candidates, not selected dependencies. Address verification is not consent. AMF and account-farm requirements are undefined.

## Correctness requirements to refine
- Record applicable consent and enforce suppression at dispatch.
- Track mailbox, recipient, campaign step, and attempt for every send.
- Deduplicate events and reconcile missed provider updates.
- Define reply stopping conditions and unsubscribe cancellation boundaries.
- Treat provider timeouts as potentially unknown outcomes; do not blindly retry non-idempotent sends.
- Distinguish provider acceptance from delivery and reading.
- Protect credentials and enforce access control.

## Open questions
1. Mailbox count, providers, and existing accounts?
2. Personal tool, team tool, or multi-customer product?
3. Consent scope, evidence, and recipient jurisdictions?
4. Manual sends, sequences, daily volume, and follow-up rules?
5. Campaign-only inbox or full mailbox synchronisation and history?
6. Existing Resend use, sending domains, and meaning of AMF/account farm?
7. Existing frontend, hosting, repository relationships, and budget?

## Design deliverables
Requirements with identifiers and acceptance criteria; C4 context/container diagrams; entity relationships; send/reply/unsubscribe sequence diagrams; API/event contracts; architecture decision records; operational recovery and verification plans. Mark each decision proposed, accepted, or unresolved.

## References
- https://c4model.com/introduction
- https://resend.com/legal/acceptable-use
- https://support.google.com/mail/answer/81126?hl=en
- https://developer.instantly.ai/
- https://hunter.io/api-documentation
- https://emailguard.io/features/inbox-placement-test

Provider capabilities and policies must be rechecked during selection. Domain separation reduces risk but does not guarantee reputation isolation.
