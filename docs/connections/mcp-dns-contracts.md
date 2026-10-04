# Elevateo Mail — MCP and DNS implementation contracts

Preparation only, 4 October 2026. Backend/desktop standards remain unapproved. No executable source,
account connection, credential capture, deployment or DNS mutation is authorised by this document.
The repository is now local `Elevateo Mail` and private GitHub `tanzeel-roseyco/elevateo-mail`.
Read product-plan.md and security-plan.md alongside this contract.

<!-- AIDEV-NOTE: MCP delegates owner-scoped services; DNS approval uses a separate broker and credential boundary. -->

## 1. Capability and authentication boundary

Ten private users authenticate separately; each uses their own Codex CLI account, then Claude as fallback.
App identity, CLI subscription identity and provider mailbox identity are distinct. Authentication derives
`ownerId` server-side; tool inputs never contain owner IDs, provider tokens, passwords or API keys.
Provider OAuth and secret entry occur exclusively in the protected Connections UI. Tools can return a
fixed app route for setup; they cannot accept secret text, arbitrary callback URLs or launch a consent flow
with caller-chosen redirect destinations. Redact secrets from telemetry and never echo them to the CLI.

For remote HTTP MCP, implement protected-resource metadata, configured issuer discovery, resource/audience
binding, OAuth PKCE, registered exact redirects, user/client consent, expiry and per-request authorization.
A session identifier supplies continuity only. Provider tokens cannot authenticate MCP or pass through it.
These requirements follow the [MCP authorization specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization).
Pin and test the protocol/client version; no unreviewed third-party MCP discovery is permitted.

An app grant stores owner, client, selected stable mailbox IDs, capability set, grant revision, expiry and
revocation time. Effective permission intersects this grant, current provider connection, owned resource
and backend policy. A list permission is insufficient for message-body reads. Read scope cannot grant
send, credentials, DNS execution, mailbox deletion or permission administration.

Default selected-mailbox AI capability is read plus app drafts, activated through explicit selection.
Sending requires separate enablement and an exact human approval. Grant expansion is a UI action, never
an AI tool. Codex gets only this facade after isolation checks. Claude initially drafts from supplied
context with tools/MCP/hooks disabled; enabling the facade later requires its own pinned Windows isolation gate.

## 2. Minimal mail facade — proposed schemas

Every object schema rejects unknown properties. IDs are opaque nonempty app IDs (maximum 128 characters),
not provider URLs. All limits below are proposed bounded defaults to approve with backend standards.
Dates are validated UTC ISO-8601; arrays reject duplicate IDs. Outputs omit raw provider responses.

| Tool and input fields | Authorization and output |
| --- | --- |
| `connections.list`: `{}` | `connections:read`; returns only selected owned connections: ID, display identity, safe health, enabled capabilities, stale/sync time and allowance. No endpoint credentials or hidden connection count. |
| `mail.search`: `{mailboxId, query, cursor?, limit?}` | `mail:read`; query length 0–500, opaque owner/grant-bound cursor, limit 1–50 (default 20). Returns message ID, sender, subject, timestamp, bounded snippet and next cursor; empty result differs from unavailable/stale data. |
| `mail.get`: `{mailboxId, messageId}` | `mail:read`; requires the message belongs to that selected mailbox. Returns text context capped at 64 KiB, truncation flag, revision and attachment metadata. No HTML execution, remote images or automatic attachment retrieval. |
| `draft.save`: `{mailboxId, draftId?, expectedRevision?, identityId, to, cc, bcc, subject, bodyText, replyMessageId?}` | `draft:write`; app-only draft. New draft omits revision; edit requires both ID and current revision. Address arrays each ≤30 and combined ≤30; subject ≤998 UTF-8 bytes, body ≤64 KiB. Returns draft ID/revision and validation warnings; creates no send approval. |
| `send.propose`: `{mailboxId, draftId, expectedRevision}` | Optional `send:propose` plus separately enabled sending; returns immutable intent ID/hash, expiry, quota estimate and app review route. Does not reserve, approve or dispatch; user approves through UI. |

All lengths apply after decoding once; malformed encodings, control characters in headers and invalid
addresses fail validation. Empty draft recipient lists/body are valid incomplete drafts; send proposal
rejects missing recipients, unusable identities and invalid content. Attachments are excluded from initial
MCP drafting; later attachment references must be owned, scanned and hash-bound, never arbitrary URLs.
Search syntax is app-defined, not raw SQL/provider command input. Bound execution time and output size.

Semantic examples: “Find the latest reply in my selected mailbox” uses search then get; “Prepare a reply”
creates an app draft referencing that message and a verified identity. “Send this” returns a proposal
only when sending is enabled; the user reviews recipients/content in Elevateo Mail. A malicious message
requesting a different mailbox or whole-inbox export cannot alter the selection grant.

AI edits invalidate any approval tied to the old draft revision. Human approval binds owner, intent hash,
sender, recipients, body/attachment hashes, campaign revision if applicable, expiry and single-use state.
Every dispatch path uses the common 30-per-stable-mailbox/day ledger and earlier 600/user/day ceiling;
aliases, reconnects, Gmail, Resend, manual, campaign and MCP share admission. Rolling 24-hour/per-recipient
counting remains proposed. Atomically reserve capacity only during authorised admission; unknown provider
outcomes retain reservations. No AI tool owns a separate counter or retries through another provider.

## 3. Revocation and safe errors

Recheck live grant revision before reads, draft mutation, proposal and dispatch, including queued jobs.
Revoking AI selection prevents new context access and invalidates pending AI proposals; disabling sending
invalidates unsent authorisations. Disconnecting provider blocks dispatch and removes stored credentials
according to the approved retention policy. Already submitted provider requests may complete; already
transmitted AI context cannot be recalled. Preserve app drafts unless the user explicitly deletes them.

Safe errors contain `{code, message, requestId, retryable}` plus an optional app remediation route.
Unauthenticated HTTP requests receive 401; insufficient capability receives 403 and scoped challenge where
appropriate. Unknown/foreign object IDs share `NOT_FOUND` without confirming another user's data exists.
Use `GRANT_REVOKED`, `CONNECTION_UNAVAILABLE`, `REVISION_CONFLICT`, `APPROVAL_REQUIRED`, `QUOTA_EXCEEDED`,
`OUTCOME_UNKNOWN` and `VALIDATION_FAILED` explicitly. Retryability never authorises a repeated send.
Audit owner/client/grant revision/action/object/outcome without bodies, passwords or full recipient lists.

## 4. Self-hosted adapter boundary

Endpoint setup lives in the protected app UI, outside MCP. Certify one named JMAP/REST server/version first.
Accept authenticated HTTPS with valid certificates, configured host/port and bounded responses; reject
URL userinfo, ambiguous URL encodings, loopback, private, link-local, metadata, multicast and unsupported
destinations for both IPv4 and IPv6. Validate discovered URLs and each redirect, including auth discovery.
Never forward credentials to a changed origin. Enforce destination policy at connection time through
verified egress; preflight DNS checks alone cannot stop rebinding. If the runtime cannot establish this
guarantee, the adapter remains unavailable. Do not advertise arbitrary server compatibility.

An independently approved always-on narrow relay may support a private server; general RFC1918 admission
and desktop-only bridges cannot provide safe PC-off campaigns. No tunnel or relay installation is approved.
Capabilities discovered from [JMAP Mail](https://www.rfc-editor.org/rfc/rfc8621) are checked against actual
account permissions; submission is sending and uses the common admission ledger.

## 5. DNS proposal and separate execution broker

Mail MCP has no DNS mutation tool or DNS credentials. A separate optional planning facade offers
`dns.propose({dnsConnectionId, subdomainGrantId, desiredRecords})` and `dns.status({planId})` with
`dns:propose`/`dns:read`. Records are typed validated values, not raw provider API payloads. The app UI
first obtains owner approval for exact subdomain/name/type grants, then separately approves each change.
Only the isolated broker receives DNS credentials. A human-authenticated approval endpoint is absent
from MCP; an internal executor consumes approved plan IDs, not caller-supplied arbitrary mutations.

Allowlist key is `(ownerId, dnsConnectionId, providerZoneId, canonicalName, recordType)` plus allowed
operation and value constraints. Initial types are only required TXT, MX or DKIM CNAME after review.
No wildcard grants, implicit descendants, A/AAAA, NS/DS, zone settings or bulk replace. Additional exact
names require explicit grants. Resolve every update/delete record ID through provider zone/name/type
before applying; the ID alone never proves permission. Existing records are not automatically app-owned.

Company apex/root MX and existing `in.elevateoco.com` plus descendants are protected in the initial broker.
Protect apex SPF/DMARC and delegation NS/DS as well. Exceptional exact owner changes need a separately
reviewed administrative/manual process; ordinary subdomain approval cannot override this denylist.

### Canonical names, aliases and delegation

Use one pinned IDNA policy/library, lowercase canonical ASCII labels and at most one terminal dot;
reject whitespace, empty labels, repeated terminal dots, URL/percent encodings and oversized labels/names.
Display both Unicode and canonical ASCII for approval. DNS owner names are not URL hostnames: permit
validated ASCII underscore labels for `_dmarc` and DKIM `_domainkey`; do not apply hostname-only validation.
Reject wildcards. Exact tuple checks are authoritative; if future descendants are explicitly approved,
compare labels (`name === base` or suffix `'.' + base`), never plain suffix/prefix matches.

Canonicalize domain-valued MX/CNAME targets separately; keep TXT content exact and type-aware, never
lowercase arbitrary TXT values. CNAME control does not confer ownership or mutation rights over its target.
Block CNAME coexistence conflicts using the full existing record set at that owner name; account for MX
priority, TXT RRset members and provider proxy flags. DKIM CNAME targets require verified provider values.
Do not follow aliases/delegation to obtain new mutation scope. NS/DS parent delegation provisioning stays
owner-managed. [Cloudflare record constraints](https://developers.cloudflare.com/api/resources/dns/subresources/records/methods/update/)
and [record types](https://developers.cloudflare.com/dns/manage-dns-records/reference/dns-record-types/) inform adapter validation.

### Immutable approval and drift handling

Plan stores owner/grant revision, provider/zone, expiry and sorted exact operations including record ID,
name/type, operation, full old/new content, TTL, MX priority/proxy fields where relevant, purpose and impact.
Baseline stores observed provider revision/modified time when available AND a digest of relevant complete
RRsets/content; create baseline includes expected absence and conflict/delegation checks. Hash a versioned
canonical serialization of the complete plan and baseline. UI approval records that exact hash/revision.

Before execution recheck owner/grant/expiry, reread affected names and relevant conflict/delegation state,
then compare content and revisions. Drift requires a new plan and approval. Do not assume provider APIs
support atomic compare-and-swap: a reread alone has an external-writer race. Serialize app broker writes,
document the provider's concurrency limits, and require a maintenance/manual route if external writers
cannot be excluded for a safety-critical change. Never describe this as guaranteed zone-wide atomicity.

Persist action identity and before snapshots before a provider call; uncertain responses enter reconciliation
before retry. Track each operation as pending/applied/failed/unknown and read back exact provider records.
Authoritative verification distinguishes applied from propagation pending. Partial failure never restores
the whole zone. Reversal is a new exact plan approved against current state; report failure/cache effects.

Cloudflare selected-zone DNS edit credentials remain zone-wide: software allowlists restrict broker
behaviour, but a stolen token can alter other records in that zone. Separate broker secrets/deployment,
redacted logs and credential rotation reduce exposure; they do not create provider-enforced record ACLs.
[Cloudflare token resources](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)
and [Enterprise-only child-zone setup](https://developers.cloudflare.com/dns/zone-setups/subdomain-setup/)
mean child-zone isolation cannot be assumed within this budget. If software restriction is unacceptable,
use manual changes or a separately verified provider boundary and keep automated mutation disabled.

## 6. Denied patterns and conformance proof

| Denied pattern | Reason / required negative test |
| --- | --- |
| Generic HTTP/DNS tool or raw credential arguments | Bypasses typed scopes and exposes keys; assert absent from tool inventory/schema. |
| Owner/mailbox ID substitution, stolen cursor or attachment reference | Cross-user data leak; two users must receive indistinguishable not-found results. |
| Session-only auth, provider token passthrough, wrong audience/issuer | Confused deputy; reject before object lookup. Test expired/revoked grants and redirect/PKCE failures. |
| AI self-approval, edited approved draft, fallback send replay | Removes human control; reject expired/used/stale approval and reconcile unknown sends. |
| Per-alias/MCP counter | Cap bypass; at 29 deliveries two concurrent one-recipient admissions permit only one. |
| Redirect/rebinding to metadata, mapped IPv6/private address | SSRF; egress fixtures must block each hop and changed resolution at connection time. |
| `evilapproved.example`, trailing-dot/IDNA ambiguity, swapped record ID | Scope bypass; test exact canonical tuple, protected suffixes, cross-zone/user grants. |
| CNAME/NS delegation as implicit authority | Rights escalation; reject target mutations, record conflicts and implicit descendants. |
| Missing RRset member, changed content/TTL, create conflict, stale plan hash | Approval drift; no mutation, require fresh diff. Test external-writer race handling explicitly. |
| DNS timeout blindly retried, partial success reported complete | Duplicate/destructive state; reconcile action and show per-record outcome; test failed reversal. |

Run behavioural unit/integration suites inside Docker with fake provider/egress responses after standards
approval. Lint/typecheck accompany implementation. Native pinned Windows tool-isolation checks are a
documented exception because Linux containers cannot prove installed CLI behaviour. No live smoke tests
without separate exact account/action authorization. Visual UI review covers selection, secure secret
entry, draft revision conflict, approval diff, revocation, stale/unknown outcomes and keyboard operation.

## 7. Staged file ownership and decisions

Keep the existing frontend intact during preparation. After approval, the interface owner extends
`src/data/ports.ts`/`src/data/gateway.ts` and adds `src/features/connections/`; no real action may write
directly to `src/data/store.ts`. The contracts owner adds `packages/contracts` only when the documented
backend migration is approved; API/services own auth/grants/drafts/ledger, adapters own Gmail/Resend/JMAP,
the desktop owner controls CLI tool discovery, and a separate DNS broker owner owns credentials/execution.
Integration tests own cross-boundary fixtures; every scope change updates DTO/UI/errors/tests together.

Efficiency contract: reuse the same mail services for UI/MCP instead of maintaining duplicate pipelines;
use bounded pages, cached safe metadata and on-demand bodies. DNS broker is a request-driven isolated
deployment, not an always-running daemon; leave it undeployed until automation is approved. Add no sidecar,
extra CLI process or polling service without measured need and a cost allowance. Keep one active local AI
task; cache/optimisation never skips live grant, approval, drift or atomic quota checks.

Implementation gates: approve backend standards; confirm bounds and daily counting; choose named
self-hosted server and reachability; approve Google/AI data-policy route; choose DNS provider and exact
names/types; accept or reject zone-wide token residual risk; settle retention and approval lifetime.
No exact DNS allowlist exists yet, so broker mutation remains unavailable. No Obsidian connector is
available: tradeoff scenarios are documented, not represented as Obsidian simulations.
