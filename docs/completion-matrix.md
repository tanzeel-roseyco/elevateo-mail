# Completion and launch gates

This is the current takeover checklist, not a production-readiness certificate. No live mail, DNS mutation, deployment or credential setup is authorized by passing a fixture.

| Area | Implemented | Remaining |
| --- | --- | --- |
| Private web application | Isolated accounts, inbox, contacts, consent, review and approval, campaign drafts, connections, recovery | Real provider and authentication acceptance |
| Sending limits | Server-owned rolling limits: 30 recipients/mailbox and 300/user; max ten mailboxes/user | Explicit production day/counting policy approval |
| Gmail | OAuth, encrypted access, bounded sync, personal manual send and verified threaded replies; no Gmail campaigns | Google approval and live-account acceptance; background push |
| Resend | Credential-bound send, suppression, signed events, unsubscribe and signed receiving reply stop | Approved sender/receiving subdomain and live end-to-end acceptance |
| Follow-up campaigns | Immutable short sequences, separate approval, predecessor checks, cancellation and default-off Resend activation with fresh channel binding | Configure approved reply channel and record live acceptance before enabling; Gmail campaigns stay unsupported |
| Enrichment | Optional user-owned Hunter key and explicit enrichment action | Live acceptance; AMF API/product specification |
| AI | Selected context, explicit draft permission, one-use native tickets, bounded Windows Claude companion and local-only GUI handoff | Installed Windows handoff/live-account verification; Codex tool-denial support and fallback; macOS runner |
| DNS | Exact approved-owner read and immutable change-plan primitives | Isolated write broker, drift-safe execution and operator acceptance; root MX stays protected |
| Operations | Job health, bounded expired-record cleanup, cold local restore test | Independent cloud monitoring, cloud/key recovery rehearsal and retention/deletion policy |
| Distribution | Web builds, compiled Tauri preview, unsigned Windows/macOS packaging script and manual workflow | Actual installer builds, Windows/macOS installed visual QA, signing and update process |
| Scale and cost | Local simulated load: ten owners, 100 mailboxes, 10,000 messages, 3,000 admitted sends and 100 quota rejections | Actual cloud throughput, storage growth, provider limits and measured monthly cost |
| Other inbox providers | Adapter boundaries | Specify and implement supported self-hosted protocol; Instantly/Smartlead remain optional proposals |

## Credentials come last

First finish implementation, fixture checks, review and packaging that require no accounts. Then configure a controlled staging deployment with server-only encryption keys, Google application identity/mailbox OAuth, Cloudflare resource bindings and opted-in Resend test addresses. Users enter their own optional enrichment credentials through the private connection flow. Local AI uses the user's existing subscription login; never copy its tokens into the application.

Use only an explicitly approved receiving subdomain. Never replace root MX for elevateoco.com, boltloop.co or flooda.co, or repurpose the existing protected in.elevateoco.com configuration.

Each live gate needs recorded evidence before enabling that feature. A disabled control must explain its missing capability rather than pretending to connect. The A$15 monthly target is not established by local load tests.
