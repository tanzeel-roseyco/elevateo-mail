# V2 draft interface packet

This additive proposal is disabled. It does not alter the frozen V1 session, read, collaboration or send contracts. Route registration waits for owning backend modules and security review. The grant route cannot transfer ownership: that requires a separate verified workflow. Organization administration returns redacted role metadata, never mailbox content. Outreach is simulation only, and worker status requires a distinct worker principal; the security mechanism remains to be validated by the infrastructure owner.

AIDEV-NOTE: No-live-send is a contract boundary, not a UI toggle. Reject unknown request fields and stale revisions. Authorization must be rechecked inside the transaction after waits.

The provisional web boundary is `apps/web/src/data/v2Contract.ts`. Canonical OpenAPI declaration generation is pending fleet execution and must be checked against these runtime schemas before a browser gateway is wired.
