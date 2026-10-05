# Docker-only simulated integration

Build from the backend worktree root:

```powershell
docker build -f backend/Dockerfile -t elevateo-mail-integration-check .
docker run --rm --network none --name elevateo-mail-integration-check elevateo-mail-integration-check
docker run --rm --network none --name elevateo-mail-integration-demo elevateo-mail-integration-check sh -c "npm run build && npm run demo"
```

Checks run generated types, ESLint, strict TypeScript, deployment **dry run**, and behavioural tests. The demo starts the bundled Worker with actual HTTP, local persisted D1 and its queue consumer, then performs the synthetic send journey. Acceptance is a durable fake receipt, never external email.

For the frontend developer's disposable local API:

```powershell
docker run --rm --name elevateo-mail-integration-fixture -p 127.0.0.1:8787:8787 elevateo-mail-integration-check sh -c "npm run build && npm run fixture"
```

The Docker-only browser proxy listens at port8787. Open http://localhost:8787 through a same-origin frontend proxy preserving the original Host; proxy both /v1 and /__fixture. POST /__fixture/session with JSON {"user":"alice"} or {"user":"bob"}, Content-Type: application/json and X-Elevateo-CSRF: 1. Browser fetch supplies its matching Origin. The proxy sets a Secure, HttpOnly, SameSite=Strict, Path=/ cookie; no bearer appears in the response or application JavaScript. The Worker bundle contains no provisioning route. Cookies work on localhost through the browser Secure-cookie exception; production requires HTTPS and a future identity provider. Bootstrap seeds distinct users, plus-tagged mailboxes and three tied-timestamp messages each. Fifteen-minute sessions rotate on bootstrap; revoked/expired sessions cannot be reissued. The private token file is for non-browser tooling only, never frontend configuration or shared logs. Container data is disposable unless deliberately mounted; preserve developer-owned storage.

Stop the named fixture container when finished. Clean only task-owned images/cache, never shared resources or volumes. Tests use Docker-internal HTTP sockets rather than a host localhost service.

Portable consumer: `backend/integration/client.ts`; runtime DTOs: `backend/contracts/v1.ts`. See [the exact handoff contract](contracts/integration-v1.md). The Fable agent must adapt responses at MailroomGateway, load the immutable saved compose preview from /:id/content, implement pending/conflict/error states, and perform actual application visual QA. Its worktree was not edited here.

## Credentials-last gates

- Agree production quota semantics, authentication/MFA, region, provider/OAuth permissions and isolated AI grants.
- Adapt the existing Fable gateway to server recovery/cookies and complete combined application visual QA.
- Rehearse independent backup/key recovery, alerts, revocation and live-provider ambiguity handling in staging.
- Verify provider contracts, alias identities, webhook authentication and measured performance/cost envelope.
- Supply least-privilege staging credentials through secure settings only after those decisions; never chat/source/logs.
- Obtain separate approval for real sending, DNS changes and production deployment. All remain disabled.

Experimental campaign/event/AI foundation routes are outside v1. Inbox synchronisation, history import, production authentication and live delivery remain unimplemented.
