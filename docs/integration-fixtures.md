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

The API listens inside Docker at port8787. Use a same-origin frontend proxy; unrestricted CORS is disabled. Offline bootstrap seeds Alice and Bob, distinct plus-tagged mailboxes, three tied-timestamp messages each and fifteen-minute sessions. Synthetic bearer values are in `/tmp/elevateo-fixture/fixture-sessions.json` inside the container, never console output. Read locally with `docker exec elevateo-mail-integration-fixture cat /tmp/elevateo-fixture/fixture-sessions.json`; keep these values out of shared logs/source. There is no HTTP minting route. Bootstrap restart rotates/revokes old sessions. Tests demonstrate expiry and revocation. Container data is disposable unless a developer deliberately mounts persistent storage; preserve developer-owned storage.

Stop the named fixture container when finished. Clean only task-owned images/cache, never shared resources or volumes. Tests use Docker-internal HTTP sockets rather than a host localhost service.

Portable consumer: `backend/integration/client.ts`; runtime DTOs: `backend/contracts/v1.ts`. See [the exact handoff contract](contracts/integration-v1.md). The Fable agent must adapt responses at MailroomGateway, retain the saved compose preview, implement pending/conflict/error states, and perform actual application visual QA. Its worktree was not edited here.

## Credentials-last gates

- Agree production quota semantics, authentication/MFA, region, provider/OAuth permissions and isolated AI grants.
- Finish frontend gateway wiring and actual application visual QA.
- Rehearse independent backup/key recovery, alerts, revocation and live-provider ambiguity handling in staging.
- Verify provider contracts, alias identities, webhook authentication and measured performance/cost envelope.
- Supply least-privilege staging credentials through secure settings only after those decisions; never chat/source/logs.
- Obtain separate approval for real sending, DNS changes and production deployment. All remain disabled.

Experimental campaign/event/AI foundation routes are outside v1. Inbox synchronisation, history import, production authentication and live delivery remain unimplemented.
