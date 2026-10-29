# Completion integration proofs

Run these only during the final local Docker gate, using the backend test image
and disposable migrated PostgreSQL fixture used by the full backend suite.
The commands below execute from `apps/server` **inside that container**.

```sh
bundle exec ruby test/be_02/connector_database_test.rb
bundle exec ruby test/sends/resend_pilot_flow_test.rb
bundle exec ruby test/send_worker/resend_wire_test.rb
```

The connector suite defines 11 tests covering real database grants, revocation on
the next request, mailbox and actor isolation, membership and session revocation,
scope denial, cited untrusted message text, unsent idempotent drafts, and rejected
citations leaving no draft or operation behind.

The Resend pilot suite defines 7 tests using the restricted API/worker database
roles and a container-loopback TCP HTTP stub. It covers approved attachment bytes,
ambiguous outcomes without resubmission, revoked approval, consent locking, and
Svix HMAC verification followed by durable bounce/complaint projection and
idempotent recipient suppression. It makes four stub HTTP requests, zero live
provider requests, and zero real sends.

Run the standalone wire suite in a container with `--network none`. Its 3 tests
make exactly six loopback HTTP requests: accepted attachment, definite rejection,
rate limit, server failure, missing receipt, and malformed JSON. The real transport
constructs the default `https://api.resend.com` URL; only its injected HTTP socket
is redirected to the local stub. Attachment tampering fails before another
request. This verifies transport serialization and response handling, not public
DNS, TLS, provider acceptance, or deliverability. All credentials are disposable
test strings. No Docker build or test has been run as part of authoring this file.

The six historical People/Members/Personal Details capture failures are documented
in `docs/completion/frontend-refinement-20261024.md`. Production roster, grant,
and preference routes exist in `apps/server/config/v2_route_registry.rb`.
The development entry supplies a fixture mailroom gateway, while
`AdministrationPage.tsx` and `PersonalSettingsPage.tsx` construct their own V2
HTTP gateways. Those missing fixture responses are a frontend fixture
wiring gap, not evidence that those production endpoints are absent. Repairing
that wiring requires the frontend owner; do not suppress browser errors or add
synthetic fallback responses to the production backend.

The isolated historical app-chain oracle exercises real HTTP, SQL, SMTP and IMAP,
including reply ancestry. Its read-only test boot adapter validates the local
held configuration before injecting Mox selection into one configuration instance.
Exact test environment, fixture database/role and container guards reject live
boot; production configuration guards remain unchanged. This oracle does not
prove production Authentik composition. Admission rejection tests and the actual
chain must both pass in the final local Docker gate; neither has run yet.
